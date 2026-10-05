'use strict';
/**
 * What a dancer's favorites look like on the request form tonight: which can
 * be requested, which they'd join, which are theirs already, which have
 * played. Each item carries the request to send if it's picked.
 *
 * Each item also says which mark it is (`mark: { kind, id }`), so it can be
 * unfavorited from the list.
 *
 * Line dances (favorites from Line Dance Manager) match requests by catalog
 * dance id, or by name for requests typed without one. Partner songs
 * (favorite songs) match by music catalog id. A favorite someone else has
 * requested is joined — sent as one more request for the same dance or song
 * — never duplicated.
 */
const { filterAvailableDances } = require('../dj/availableDances');
const { isActive } = require('../dj/queue');
const { danceSearchFields, normalizeSearchText } = require('../dj/danceTextSearch');

// Sort order: what can be requested first, then what's done.
const RANK = { available: 0, join: 1, mine: 2, playing: 3, played: 4 };
const SELECTABLE = new Set(['available', 'join']);

function playedAtLabel(requests) {
  const last = requests.reduce((t, r) => Math.max(t, new Date(r.updatedAt ?? r.createdAt).getTime() || 0), 0);
  if (!last) return 'Played tonight';
  return `Played at ${new Date(last).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

/** A label for others' active requests: "In queue" once the DJ has queued it, else "3 requested". */
function joinLabel(active) {
  if (active.some(r => r.status === 'approved')) return 'In queue · you’ll join it';
  const people = new Set(active.map(r => r.clientId || r._id)).size;
  return `${people} requested · you’ll join it`;
}

function byRankThenTitle(a, b) {
  return RANK[a.status.type] - RANK[b.status.type] || a.title.localeCompare(b.title);
}

function item(key, title, sub, status, payload, extra = {}) {
  return { key, title, sub, status, selectable: SELECTABLE.has(status.type), payload, ...extra };
}

/**
 * Favorite line dances → [{ key, title, sub, difficulty, status: { type, label }, selectable, payload }]
 * `dances` is the catalog (/api/dj/dances), `favoriteIds` the dancer's favorite dance ids.
 */
function favoriteDanceItems({ dances, favoriteIds, requests, clientId }) {
  const ids = new Set((favoriteIds ?? []).map(String));
  if (!ids.size) return [];
  const available = new Set(filterAvailableDances(dances, requests).map(d => String(d.id)));
  const lines = requests.filter(r => r.danceType !== 'partner' && r.danceType !== 'message');

  return dances
    .filter(d => ids.has(String(d.id)))
    .map(d => {
      const name = (d.danceName ?? '').toLowerCase().trim();
      const same = lines.filter(r => (r.danceId && String(r.danceId) === String(d.id)) || (r.danceName ?? '').toLowerCase().trim() === name);
      const active = same.filter(isActive);
      let status;
      if (active.some(r => r.clientId === clientId && r.status !== 'playing')) status = { type: 'mine', label: 'Requested by you' };
      else if (same.some(r => r.status === 'playing')) status = { type: 'playing', label: 'Playing now' };
      else if (!available.has(String(d.id))) status = { type: 'played', label: playedAtLabel(same.filter(r => r.status === 'played')) };
      else if (active.length) status = { type: 'join', label: joinLabel(active) };
      else status = { type: 'available', label: '' };

      return item(`dance:${d.id}`, d.danceName, d.songName ? `${d.songName}${d.artist ? ` — ${d.artist}` : ''}` : '', status, {
        danceId: d.id,
        danceName: d.danceName,
        songName: d.songName ?? '',
        artist: d.artist ?? '',
        difficulty: d.difficulty ?? '',
        stepsheet: d.stepsheet ?? '',
        duration_ms: d.duration_ms ?? null,
        spotifyUri: d.spotifyUri ?? null,
        danceType: null,
        notes: '',
      }, {
        difficulty: d.difficulty ?? '',
        stepsheet: d.stepsheet ?? '',
        mark: { kind: 'favorite', id: String(d.id) },
        // For "Find in your favorites": everything about the dance (ranked
        // name, then song/artist, then choreographer) and its status tonight.
        searchFields: danceSearchFields(d, status.label),
      });
    })
    .sort(byRankThenTitle);
}

/**
 * Favorite songs (partner dances) → the same item shape.
 * `songs` is [{ id, title, artist, durationMs }] from /api/dancer/marks.
 */
function favoriteSongItems({ songs, requests, clientId }) {
  if (!songs?.length) return [];
  const partners = requests.filter(r => r.danceType === 'partner' && r.catalogTrackId);

  return songs
    .map(song => {
      const same = partners.filter(r => r.catalogTrackId === song.id);
      const active = same.filter(isActive);
      const others = active.filter(r => r.status !== 'playing');
      let status;
      let partnerGroupId;
      if (others.some(r => r.clientId === clientId)) status = { type: 'mine', label: 'Requested by you' };
      else if (same.some(r => r.status === 'playing')) status = { type: 'playing', label: 'Playing now' };
      else if (others.length) {
        status = { type: 'join', label: joinLabel(others) };
        partnerGroupId = String(others[0].partnerGroupId || others[0]._id);
      } else if (same.some(r => r.status === 'played')) status = { type: 'played', label: playedAtLabel(same.filter(r => r.status === 'played')) };
      else status = { type: 'available', label: '' };

      return item(`song:${song.id}`, song.title, song.artist ?? '', status, {
        danceId: null,
        danceName: 'Partner Dance',
        danceType: 'partner',
        partnerStyle: null,
        songName: song.title,
        artist: song.artist ?? '',
        catalogTrackId: song.id,
        duration_ms: song.durationMs ?? null,
        notes: '',
        ...(partnerGroupId && { partnerGroupId }),
      }, {
        mark: { kind: 'song', id: song.id },
        searchFields: {
          name: normalizeSearchText(song.title),
          songArtist: normalizeSearchText(song.artist),
          people: '',
          other: normalizeSearchText(status.label),
        },
      });
    })
    .sort(byRankThenTitle);
}

/**
 * The wishlist (dances the dancer wants to learn — for their instructors,
 * not for requesting) → [{ key, title, sub, difficulty, stepsheet, refresh, mark, searchFields }],
 * by title. `refresh` is a dance they know and want to brush up on.
 */
function wishlistItems({ dances, wishlistIds, refreshIds }) {
  const ids = new Set((wishlistIds ?? []).map(String));
  if (!ids.size) return [];
  const refresh = new Set((refreshIds ?? []).map(String));
  return dances
    .filter(d => ids.has(String(d.id)))
    .map(d => ({
      key: `wish:${d.id}`,
      title: d.danceName,
      sub: d.songName ? `${d.songName}${d.artist ? ` — ${d.artist}` : ''}` : '',
      difficulty: d.difficulty ?? '',
      stepsheet: d.stepsheet ?? '',
      refresh: refresh.has(String(d.id)),
      mark: { kind: 'wishlist', id: String(d.id) },
      searchFields: danceSearchFields(d, refresh.has(String(d.id)) ? 'refresh' : ''),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

module.exports = { favoriteDanceItems, favoriteSongItems, wishlistItems };
