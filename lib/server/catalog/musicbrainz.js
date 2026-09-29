'use strict';
/**
 * MusicBrainz → catalog records.
 *
 * Only MusicBrainz "core data" is used (recording title, artist credit,
 * length, ISRCs), which is CC0 and fine for commercial use. Tags and genres
 * are CC BY-NC-SA, so they must not be imported.
 * See https://musicbrainz.org/doc/MusicBrainz_Database
 */

/** "Brooks & Dunn", "Artist feat. Other" — the credit exactly as printed. */
function artistCreditName(credit) {
  return (credit ?? []).map(c => `${c.name ?? c.artist?.name ?? ''}${c.joinphrase ?? ''}`).join('').trim();
}

function yearOf(date) {
  const y = Number.parseInt(String(date ?? '').slice(0, 4), 10);
  return Number.isInteger(y) && y > 0 ? y : null;
}

/**
 * Catalog record for a recording from the MusicBrainz web service (search
 * result or lookup), or null for ones not worth offering (videos, untitled).
 */
function fromRecording(r) {
  if (!r?.id || !r.title || r.video) return null;
  const artist = artistCreditName(r['artist-credit']);
  if (!artist) return null;
  return {
    source: 'musicbrainz',
    sourceId: r.id,
    title: r.title,
    artist,
    disambiguation: r.disambiguation ?? '',
    durationMs: Number.isFinite(r.length) ? r.length : null,
    isrcs: r.isrcs ?? [],
    year: yearOf(r['first-release-date']),
    // Recordings that appear on many releases are usually the well-known version.
    rank: Array.isArray(r.releases) ? r.releases.length : 0,
  };
}

module.exports = { artistCreditName, fromRecording };
