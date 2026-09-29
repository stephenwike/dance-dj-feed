'use strict';
/**
 * Pure logic for the local-files plugin's music library: which files count as
 * audio, how tracks are named when tags are missing, and how a request is
 * matched to a file. No browser APIs here so Jest can require it directly.
 *
 * A library entry is:
 *   { key, title, artist, album, durationMs, isrcs, size, lastModified, v }
 * where `key` is the file's path relative to the chosen music folder
 * ("Line Dance/Steve Earle - Copperhead Road.mp3"). Requests store that key
 * as `localTrackKey` once the DJ adds or assigns a file.
 */

const { normalizeText } = require('../../../../dj/musicText');
const { tempoOf } = require('../../../../dj/tempo');

// Two files of one song within this many ms are treated as the same length;
// versions (radio edit vs extended) usually differ by far more.
const DURATION_TOLERANCE_MS = 3000;

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
  const byIsrc = new Map();
  for (const x of all) {
    if (x.nTitle) {
      if (!byTitle.has(x.nTitle)) byTitle.set(x.nTitle, []);
      byTitle.get(x.nTitle).push(x);
    }
    for (const isrc of x.entry.isrcs ?? []) {
      const k = String(isrc).toUpperCase();
      if (!byIsrc.has(k)) byIsrc.set(k, x.entry);
    }
  }
  return { all, byKey, byTitle, byIsrc, size: all.length };
}

const EMPTY_INDEX = buildLibraryIndex([]);

/** The request's recording length at normal speed (served durations include tempo). */
function baseDurationMs(request) {
  return request.duration_ms ? request.duration_ms * tempoOf(request) : null;
}

/** The candidate closest in length to `targetMs`, if any is within tolerance. */
function closestByDuration(candidates, targetMs) {
  if (!targetMs) return null;
  let best = null;
  let bestDiff = Infinity;
  for (const c of candidates) {
    if (!c.entry.durationMs) continue;
    const diff = Math.abs(c.entry.durationMs - targetMs);
    if (diff <= DURATION_TOLERANCE_MS && diff < bestDiff) { best = c; bestDiff = diff; }
  }
  return best;
}

/** Title (+ artist, + length) match — the fallback when no id links request and file. */
function matchByName(index, request) {
  const { title, artist } = requestTrack(request);
  const candidates = index.byTitle.get(normalizeText(title)) ?? [];
  if (!candidates.length) return null;
  const target = baseDurationMs(request);

  const a = normalizeText(artist);
  if (!a) {
    if (candidates.length === 1) return candidates[0].entry;
    return closestByDuration(candidates, target)?.entry ?? null;
  }

  const tiers = [
    candidates.filter(c => c.nArtist === a),
    candidates.filter(c => c.nArtist && c.nArtist !== a && (c.nArtist.includes(a) || a.includes(c.nArtist))),
    candidates.filter(c => !c.nArtist),
  ];
  const tier = tiers.find(t => t.length);
  if (!tier) return null;
  return (closestByDuration(tier, target) ?? tier[0]).entry;
}

/**
 * The library entry to play for a request, and how it was found — or null.
 *
 * Strongest evidence first:
 *   'assigned' — the DJ pinned this file to this request (localTrackKey)
 *   'linked'   — the DJ earlier pinned this file to the same catalog song
 *                (`links`: { catalogTrackId → key })
 *   'isrc'     — the file's ISRC tag names the requested recording
 *   'name'     — title must match exactly (after normalising); when the
 *                request names an artist, the file's artist must match it,
 *                contain it, or be missing (a same-titled song by a different
 *                artist is a different recording, and dances are choreographed
 *                to one version). Length breaks ties between versions. Without
 *                an artist, only an unambiguous title or length matches.
 */
function explainMatch(index, request, links = {}) {
  if (!request) return null;
  if (request.localTrackKey && index.byKey.has(request.localTrackKey)) {
    return { entry: index.byKey.get(request.localTrackKey), via: 'assigned' };
  }
  const linkedKey = request.catalogTrackId ? links[request.catalogTrackId] : null;
  if (linkedKey && index.byKey.has(linkedKey)) {
    return { entry: index.byKey.get(linkedKey), via: 'linked' };
  }
  for (const isrc of request.isrcs ?? []) {
    const entry = index.byIsrc.get(String(isrc).toUpperCase());
    if (entry) return { entry, via: 'isrc' };
  }
  const entry = matchByName(index, request);
  return entry ? { entry, via: 'name' } : null;
}

/** The library entry to play for a request, or null. See explainMatch. */
function matchTrack(index, request, links) {
  return explainMatch(index, request, links)?.entry ?? null;
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
  explainMatch,
  matchTrack,
  searchLibrary,
};
