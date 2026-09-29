'use strict';
/**
 * Pure logic for the local-files plugin's music library: which files count as
 * audio, how tracks are named when tags are missing, and how a request is
 * matched to a file. No browser APIs here so Jest can require it directly.
 *
 * A library entry is:
 *   { key, title, artist, album, durationMs, size, lastModified }
 * where `key` is the file's path relative to the chosen music folder
 * ("Line Dance/Steve Earle - Copperhead Road.mp3"). Requests store that key
 * as `localTrackKey` once the DJ adds or assigns a file.
 */

// Formats Chrome and Edge can play with <audio>.
const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'aac', 'mp4', 'wav', 'flac', 'ogg', 'oga', 'opus', 'webm'];

function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

function isAudioFile(name) {
  return !name.startsWith('.') && AUDIO_EXTENSIONS.includes(extensionOf(name));
}

/**
 * Comparable form of a title or artist: lower case, no accents, no bracketed
 * suffixes ("(Radio Edit)", "[Remastered]"), no "feat." credits, and only
 * letters/digits separated by single spaces.
 */
function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[([][^)\]]*[)\]]/g, ' ')
    .replace(/\s(feat|ft)\.?\s.*$/, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Best-guess title/artist from a path when the file has no tags.
 * Handles "Artist - Title.mp3" and strips leading track numbers ("01 - ", "01. ").
 */
function parseFilename(path) {
  const base = path.split('/').pop().replace(/\.[^.]+$/, '');
  const unnumbered = base.replace(/^\d{1,3}\s*(?:[-.)]\s*|\s+)/, '');
  const parts = unnumbered.split(' - ');
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  }
  return { artist: '', title: unnumbered.trim() };
}

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

/**
 * Precompute normalised fields and lookups for matching and search.
 * Entries are sorted by key so ties always resolve the same way.
 */
function buildLibraryIndex(entries) {
  const all = [...entries]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(e => {
      const nTitle = normalizeText(e.title);
      const nArtist = normalizeText(e.artist);
      return { entry: e, nTitle, nArtist, haystack: `${nTitle} ${nArtist} ${normalizeText(e.album)} ${normalizeText(e.key)}` };
    });
  const byKey = new Map(all.map(x => [x.entry.key, x.entry]));
  const byTitle = new Map();
  for (const x of all) {
    if (!x.nTitle) continue;
    if (!byTitle.has(x.nTitle)) byTitle.set(x.nTitle, []);
    byTitle.get(x.nTitle).push(x);
  }
  return { all, byKey, byTitle, size: all.length };
}

const EMPTY_INDEX = buildLibraryIndex([]);

/**
 * The library entry to play for a request, or null.
 *
 * An explicit localTrackKey wins. Otherwise the title must match exactly
 * (after normalising) and, when the request names an artist, the file's
 * artist must match it, contain it, or be missing — a same-titled song by a
 * different artist is a different recording, and line dances are
 * choreographed to one version. Without an artist, only an unambiguous title
 * matches; the DJ can assign a file by hand otherwise.
 */
function matchTrack(index, request) {
  if (!request) return null;
  if (request.localTrackKey && index.byKey.has(request.localTrackKey)) {
    return index.byKey.get(request.localTrackKey);
  }
  const { title, artist } = requestTrack(request);
  const candidates = index.byTitle.get(normalizeText(title)) ?? [];
  if (!candidates.length) return null;

  const a = normalizeText(artist);
  if (!a) return candidates.length === 1 ? candidates[0].entry : null;

  const found = candidates.find(c => c.nArtist === a)
    ?? candidates.find(c => c.nArtist && (c.nArtist.includes(a) || a.includes(c.nArtist)))
    ?? candidates.find(c => !c.nArtist);
  return found?.entry ?? null;
}

/** Entries whose title, artist, album or path contain every word of `query`. */
function searchLibrary(index, query, limit = 25) {
  const words = normalizeText(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const x of index.all) {
    if (words.every(w => x.haystack.includes(w))) {
      out.push(x.entry);
      if (out.length >= limit) break;
    }
  }
  return out;
}

module.exports = {
  AUDIO_EXTENSIONS,
  EMPTY_INDEX,
  isAudioFile,
  normalizeText,
  parseFilename,
  requestTrack,
  buildLibraryIndex,
  matchTrack,
  searchLibrary,
};
