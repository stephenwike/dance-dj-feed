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
const { requestTrack, lookupKeys, historyPick } = require('./requestIdentity');

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

// A trailing " - <note>" on a title that names a release variant of the same
// recording ("- 2008 Remaster", "- Radio Edit", "- Single Version"). Notes
// naming a different recording (live, acoustic, remix…) are kept, so those
// never match as the original.
const SAME_RECORDING_NOTE = /\b(remaster(ed)?|radio edit|edit|(single|album|lp) version|explicit|clean|mono|stereo)\b/i;
const DIFFERENT_RECORDING_NOTE = /\b(live|acoustic|demo|instrumental|karaoke|remix|mix|cover|unplugged)\b/i;

function stripVersionNote(title) {
  const m = String(title ?? '').match(/^(.*)\s[-\u2013\u2014]\s(.+)$/);
  if (!m) return title ?? '';
  const [, head, note] = m;
  return SAME_RECORDING_NOTE.test(note) && !DIFFERENT_RECORDING_NOTE.test(note) ? head : title;
}

/**
 * One word's matching form. Dropped g's ("rockin'" vs "rocking") become the
 * same word: every word ending in "in" gains a "g". Applied to both sides of
 * every comparison, so a word like "cabin" still only matches itself.
 */
function canonWord(w) {
  return w.length >= 4 && w.endsWith('in') ? `${w}g` : w;
}

/** Matching form of a title: normalised, release-variant note removed, canonical words. */
function titleKey(title) {
  return normalizeText(stripVersionNote(title)).split(' ').filter(Boolean).map(canonWord).join(' ');
}

/** Matching form of an artist credit. */
function artistKey(artist) {
  return normalizeText(artist).split(' ').filter(Boolean).map(canonWord).join(' ');
}

/** Words of the folders a file sits in ("Steve Earle/Copperhead Road/01.mp3"). */
function folderWords(key) {
  return wordSet(key.split('/').slice(0, -1).map(artistKey).join(' '));
}

/**
 * Precompute normalised fields and lookups for matching and search.
 * Entries are sorted by key so ties always resolve the same way.
 */
function buildLibraryIndex(entries) {
  const all = [...entries]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(e => {
      const nTitle = titleKey(e.title);
      const nArtist = artistKey(e.artist);
      return {
        entry: e, nTitle, nArtist,
        titleWords: wordSet(nTitle),
        // The filename's title too: tags are often worse than filenames
        // ("Track 01" tagged, "Copperhead Road.mp3" on disk).
        fileTitleWords: wordSet(titleKey(parseFilename(e.key).title)),
        artistWords: wordSet(nArtist),
        folderWords: folderWords(e.key),
        haystack: `${normalizeText(e.title)} ${normalizeText(e.artist)} ${normalizeText(e.album)} ${normalizeText(e.key)}`,
      };
    });
  const byKey = new Map(all.map(x => [x.entry.key, x.entry]));
  const itemByKey = new Map(all.map(x => [x.entry.key, x]));
  const byTitle = new Map();
  const byIsrc = new Map();
  const byTitleWord = new Map();
  for (const x of all) {
    for (const w of new Set([...x.titleWords, ...x.fileTitleWords])) {
      if (!byTitleWord.has(w)) byTitleWord.set(w, []);
      byTitleWord.get(w).push(x);
    }
    if (x.nTitle) {
      if (!byTitle.has(x.nTitle)) byTitle.set(x.nTitle, []);
      byTitle.get(x.nTitle).push(x);
    }
    for (const isrc of x.entry.isrcs ?? []) {
      const k = String(isrc).toUpperCase();
      if (!byIsrc.has(k)) byIsrc.set(k, x.entry);
    }
  }
  return { all, byKey, itemByKey, byTitle, byIsrc, byTitleWord, keys: new Set(byKey.keys()), size: all.length };
}

function wordSet(normalized) {
  return new Set(normalized.split(' ').filter(Boolean));
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
  const candidates = index.byTitle.get(titleKey(title)) ?? [];
  if (!candidates.length) return null;
  const target = baseDurationMs(request);

  const a = artistKey(artist);
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

// Fuzzy suggestion: title words weigh most; artist and length help when known.
const SUGGEST_WEIGHTS = { title: 0.6, artist: 0.25, duration: 0.15 };
const SUGGEST_MIN_TITLE = 0.5;
const SUGGEST_MIN_SCORE = 0.6;
// Title words shared by this many files (e.g. "love", "the") don't pick candidates.
const COMMON_WORD_LIMIT = 500;
// Length difference at which the length score reaches 0.
const DURATION_SCALE_MS = 30_000;

/** Shared-word similarity of two word sets, 0..1 (Sørensen–Dice). */
function wordSimilarity(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return (2 * shared) / (a.size + b.size);
}

// A "Find file" hit tagged with a different artist ranks below one that isn't.
const ARTIST_DIFFERS_FACTOR = 0.8;
// Loose title overlap needed to list a file among a request's closest files.
const CLOSEST_MIN_TITLE = 0.25;

/** Share of `wanted` words present in `have`, 0..1. */
function coverage(wanted, have) {
  if (!wanted.size || !have.size) return 0;
  let found = 0;
  for (const w of wanted) if (have.has(w)) found++;
  return found / wanted.size;
}

/** How well `words` match a file's tag title or, if closer, its filename. */
function titleSimilarity(words, c) {
  return Math.max(wordSimilarity(words, c.titleWords), wordSimilarity(words, c.fileTitleWords));
}

/** A file tagged with a different artist than the request names. */
function artistConflict(artistWords, c) {
  return artistWords.size > 0 && c.artistWords.size > 0 && wordSimilarity(artistWords, c.artistWords) === 0;
}

/**
 * Titles a request could go by. A line dance is often named after its song,
 * so its dance name counts as a second title.
 */
function requestTitleStrings(request) {
  const { title } = requestTrack(request);
  const titles = [title];
  if (request.danceType !== 'partner' && !request.isSongSwap && request.danceName && request.danceName !== title) {
    titles.push(request.danceName);
  }
  return titles.filter(Boolean);
}

/** requestTitleStrings as matching word sets. */
function requestTitles(request) {
  return requestTitleStrings(request).map(t => wordSet(titleKey(t))).filter(w => w.size);
}

/**
 * Library files scored against a request, best first:
 * [{ entry, score, titleSim, artistDiffers }]. Title words weigh most; artist
 * and length count when both sides have them. A file tagged with a different
 * artist scores 0 for artist rather than being left out: DJs' files often
 * carry compilation or remix credits, and a suggestion is only a suggestion.
 * A file with no artist tag is checked against its folder names instead
 * (often "Artist/Album/…").
 */
function scoreCandidates(index, request, { minTitle = SUGGEST_MIN_TITLE } = {}) {
  const titleSets = requestTitles(request);
  if (!titleSets.length) return [];
  const artistWords = wordSet(artistKey(requestTrack(request).artist));
  const target = baseDurationMs(request);

  const candidates = new Set();
  for (const words of titleSets) {
    for (const w of words) {
      const list = index.byTitleWord.get(w);
      if (list && list.length <= COMMON_WORD_LIMIT) list.forEach(c => candidates.add(c));
    }
  }

  const scored = [];
  for (const c of candidates) {
    const titleSim = Math.max(...titleSets.map(words => titleSimilarity(words, c)));
    if (titleSim < minTitle) continue;
    let weighted = SUGGEST_WEIGHTS.title * titleSim;
    let weights = SUGGEST_WEIGHTS.title;
    const artistDiffers = artistConflict(artistWords, c);
    if (artistWords.size) {
      let artistSim = null;
      if (c.artistWords.size) {
        artistSim = wordSimilarity(artistWords, c.artistWords);
      } else if (c.folderWords.size) {
        const found = coverage(artistWords, c.folderWords);
        if (found > 0) artistSim = found;
      }
      if (artistSim !== null) {
        weighted += SUGGEST_WEIGHTS.artist * artistSim;
        weights += SUGGEST_WEIGHTS.artist;
      }
    }
    if (target && c.entry.durationMs) {
      const durationSim = Math.max(0, 1 - Math.abs(c.entry.durationMs - target) / DURATION_SCALE_MS);
      weighted += SUGGEST_WEIGHTS.duration * durationSim;
      weights += SUGGEST_WEIGHTS.duration;
    }
    scored.push({ entry: c.entry, score: weighted / weights, titleSim, artistDiffers });
  }
  return scored.sort((a, b) => b.score - a.score || a.entry.key.localeCompare(b.entry.key));
}

/**
 * Best-guess file for a request no exact method matched ("Copperhead Rd"
 * for "Copperhead Road", an untagged file in a "Steve Earle" folder), or
 * null. Returns { entry, score, artistDiffers }.
 */
function suggestByName(index, request) {
  const best = scoreCandidates(index, request)[0];
  if (!best || best.score < SUGGEST_MIN_SCORE) return null;
  return { entry: best.entry, score: best.score, artistDiffers: best.artistDiffers };
}

/**
 * The `limit` files most like a request, however weak — shown to the DJ when
 * nothing matched, so the right file is one click away. [{ entry, score }].
 */
function closestFiles(index, request, limit = 3) {
  const seen = new Set();
  return [...scoreCandidates(index, request, { minTitle: CLOSEST_MIN_TITLE }), ...searchHits(index, request)]
    .sort((a, b) => b.score - a.score)
    .filter(({ entry }) => !seen.has(entry.key) && seen.add(entry.key))
    .slice(0, limit)
    .map(({ entry, score }) => ({ entry, score }));
}

/**
 * The files the DJ's "Find file" search shows for this request: every word of
 * the request's title (or, for a line dance, its name) somewhere in a file's
 * title, artist, album or path. Scored by how closely the file's title or
 * filename matches; files tagged with a different artist rank lower.
 * [{ entry, score, artistDiffers }], best first.
 */
function searchHits(index, request) {
  const artistWords = wordSet(artistKey(requestTrack(request).artist));
  const hits = new Map();
  for (const title of requestTitleStrings(request)) {
    const words = wordSet(titleKey(title));
    // The raw title, exactly as "Find file" searches it.
    for (const entry of searchLibrary(index, title)) {
      const c = index.itemByKey.get(entry.key);
      if (!c) continue;
      const artistDiffers = artistConflict(artistWords, c);
      const score = titleSimilarity(words, c) * (artistDiffers ? ARTIST_DIFFERS_FACTOR : 1);
      if (!hits.has(entry.key) || hits.get(entry.key).score < score) hits.set(entry.key, { entry, score, artistDiffers });
    }
  }
  return [...hits.values()].sort((a, b) => b.score - a.score || a.entry.key.localeCompare(b.entry.key));
}

/**
 * The library entry to play for a request, and how it was found — or null.
 *
 * `memory` is the DJ's local memory ({ links, history }, see requestIdentity):
 *   links   — { identityKey → file key }: files the DJ chose before
 *   history — what played for each dance/song
 *
 * Strongest evidence first:
 *   'assigned'  — the DJ pinned this file to this request (localTrackKey)
 *   'linked'    — the DJ chose this file before for the same dance (or, for
 *                 a swap/partner request, the same song)
 *   'isrc'      — the file's ISRC tag names the requested recording
 *   'name'      — title must match exactly (after normalising); when the
 *                 request names an artist, the file's artist must match it,
 *                 contain it, or be missing (a same-titled song by a different
 *                 artist is a different recording, and dances are choreographed
 *                 to one version). Length breaks ties between versions. Without
 *                 an artist, only an unambiguous title or length matches.
 *   'history'   — the file most played for this dance before (its own plays
 *                 far outweigh swaps played for it)
 *   'suggested' — the closest fuzzy match on title (tag or filename),
 *                 artist and length; failing that, the top result of the
 *                 search the DJ's "Find file" runs. May be a file tagged with
 *                 a different artist (then `artistDiffers: true`).
 * The last two are guesses: the controller plays them, but asks the DJ to
 * confirm (which links the file).
 */
function explainMatch(index, request, memory = {}) {
  if (!request) return null;
  const { links = {}, history = {} } = memory;
  if (request.localTrackKey && index.byKey.has(request.localTrackKey)) {
    return { entry: index.byKey.get(request.localTrackKey), via: 'assigned' };
  }
  for (const key of lookupKeys(request)) {
    const linked = links[key];
    if (linked && index.byKey.has(linked)) return { entry: index.byKey.get(linked), via: 'linked' };
  }
  for (const isrc of request.isrcs ?? []) {
    const entry = index.byIsrc.get(String(isrc).toUpperCase());
    if (entry) return { entry, via: 'isrc' };
  }
  const named = matchByName(index, request);
  if (named) return { entry: named, via: 'name' };
  const played = historyPick(history, request, index.keys);
  if (played) return { entry: index.byKey.get(played), via: 'history' };
  const suggested = suggestByName(index, request) ?? searchHits(index, request)[0];
  return suggested ? { entry: suggested.entry, via: 'suggested', artistDiffers: !!suggested.artistDiffers } : null;
}

/** Whether a match is a guess the DJ should confirm. */
function isGuess(match) {
  return match?.via === 'history' || match?.via === 'suggested';
}

/** The library entry to play for a request, or null. See explainMatch. */
function matchTrack(index, request, memory) {
  return explainMatch(index, request, memory)?.entry ?? null;
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
  isGuess,
  matchTrack,
  suggestByName,
  closestFiles,
  titleKey,
  searchLibrary,
};
