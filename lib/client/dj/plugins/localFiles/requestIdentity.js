'use strict';
/**
 * What a request is asking for, as stable keys the DJ's local memory hangs
 * off — remembered file choices ("links") and play history. All of it stays
 * in the DJ's browser (libraryStore.js); nothing here touches the server.
 *
 * Keys:
 *   dance:<danceId>              a line dance from the dance catalog
 *   dance-name:<name>            a line dance typed by name
 *   song:<catalogTrackId>        a song from the music catalog
 *   song-name:<title>|<artist>   a song typed by name
 * (names normalised with lib/dj/musicText).
 *
 * A line dance request is about the dance; a song swap or partner request is
 * about the song. So a file the DJ picks for "Tush Push" becomes that dance's
 * file, while one picked for a swap belongs to the swapped-in song only.
 */
const { normalizeText } = require('../../../../dj/musicText');

// History kept per key: the most recently played files, enough for a
// dance's usual song plus the swaps people ask for.
const HISTORY_FILES_PER_KEY = 20;

/**
 * The song a request wants played. A song swap replaces the dance's usual
 * song; free-form line-dance requests often only carry a dance name, which is
 * usually the song title too.
 */
function requestTrack(r) {
  if (r.isSongSwap && r.swapSongName) return { title: r.swapSongName, artist: r.swapArtist ?? '' };
  const title = r.songName || (r.danceType === 'partner' ? '' : r.danceName) || '';
  return { title, artist: r.artist ?? '' };
}

/** { danceKey, songKey, aboutSong }: identity keys for a request (null when absent). */
function requestKeys(r) {
  const isPartner = r.danceType === 'partner';
  let danceKey = null;
  if (!isPartner) {
    if (r.danceId) danceKey = `dance:${r.danceId}`;
    else if (normalizeText(r.danceName)) danceKey = `dance-name:${normalizeText(r.danceName)}`;
  }
  let songKey = null;
  if (r.catalogTrackId) songKey = `song:${r.catalogTrackId}`;
  else {
    const { title, artist } = requestTrack(r);
    const nTitle = normalizeText(title);
    if (nTitle) songKey = `song-name:${nTitle}|${normalizeText(artist)}`;
  }
  return { danceKey, songKey, aboutSong: isPartner || !!r.isSongSwap || !danceKey };
}

/** Keys whose remembered file applies to this request, most specific first. */
function lookupKeys(r) {
  const { danceKey, songKey, aboutSong } = requestKeys(r);
  return (aboutSong ? [songKey] : [danceKey, songKey]).filter(Boolean);
}

/**
 * Keys to remember a DJ's file choice under. A line dance links the dance
 * (and its catalog song, when the request names one exactly); a swap or
 * partner request links only its song.
 */
function linkKeys(r) {
  const { danceKey, songKey, aboutSong } = requestKeys(r);
  if (aboutSong) return [songKey].filter(Boolean);
  return [danceKey, r.catalogTrackId ? songKey : null].filter(Boolean);
}

const KEY_PREFIX = /^(dance|dance-name|song|song-name):/;

/**
 * Links saved before identity keys existed were keyed by bare
 * catalogTrackId; read those as song keys.
 */
function migrateLinks(links) {
  const out = {};
  for (const [k, v] of Object.entries(links ?? {})) out[KEY_PREFIX.test(k) ? k : `song:${k}`] = v;
  return out;
}

/**
 * History after `fileKey` played for request `r`. Recorded under the dance
 * (counting swap plays separately, so a dance's usual song stays its usual
 * song) and under the song.
 *
 * history: { [identityKey]: { [fileKey]: { plays, swapPlays, last } } }
 */
function recordPlay(history, r, fileKey, now = Date.now()) {
  const { danceKey, songKey } = requestKeys(r);
  const next = { ...history };
  const bump = (key, isSwap) => {
    const files = { ...(next[key] ?? {}) };
    const prev = files[fileKey] ?? { plays: 0, swapPlays: 0, last: 0 };
    files[fileKey] = {
      plays: prev.plays + (isSwap ? 0 : 1),
      swapPlays: prev.swapPlays + (isSwap ? 1 : 0),
      last: now,
    };
    // Keep the most recently played files per key.
    const kept = Object.entries(files).sort((a, b) => b[1].last - a[1].last).slice(0, HISTORY_FILES_PER_KEY);
    next[key] = Object.fromEntries(kept);
  };
  if (danceKey) bump(danceKey, !!r.isSongSwap);
  if (songKey && songKey !== danceKey) bump(songKey, false);
  return next;
}

/**
 * The file most associated with this request by play history, among
 * `available` file keys (a Set), or null. For a line dance: the dance's own
 * plays weigh far more than swaps played for it. For a swap or partner
 * request: plays of the song.
 */
function historyPick(history, r, available) {
  const { danceKey, songKey, aboutSong } = requestKeys(r);
  const key = aboutSong ? songKey : danceKey;
  const files = key ? history?.[key] : null;
  if (!files) return null;
  let best = null;
  let bestScore = 0;
  for (const [fileKey, h] of Object.entries(files)) {
    if (!available.has(fileKey)) continue;
    const score = h.plays + h.swapPlays * 0.25;
    if (score > bestScore || (score === bestScore && best && h.last > files[best].last)) {
      best = fileKey;
      bestScore = score;
    }
  }
  return best;
}

module.exports = {
  requestTrack, requestKeys, lookupKeys, linkKeys, migrateLinks, recordPlay, historyPick,
  HISTORY_FILES_PER_KEY,
};
