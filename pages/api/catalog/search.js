import clientPromise from '../../../lib/server/mongodb';
import { createCatalogSearch } from '../../../lib/server/catalog/catalogSearch';
import { createMusicBrainzClient } from '../../../lib/server/catalog/musicbrainzClient';
import { createListenBrainzClient } from '../../../lib/server/catalog/listenbrainzClient';

// The MusicBrainz client holds the shared 1-request/second throttle, so there
// must be one per server process: cached on `global`, which also survives dev
// hot reloads. Without MUSICBRAINZ_CONTACT the catalog is searched locally only.
if (global._musicbrainz === undefined) {
  const contact = process.env.MUSICBRAINZ_CONTACT;
  global._musicbrainz = createMusicBrainzClient({ contact });
  global._listenbrainz = contact ? createListenBrainzClient({ userAgent: `LineDanceDJFeed/0.1 ( ${contact} )` }) : null;
}
const search = createCatalogSearch({ musicbrainz: global._musicbrainz, listenbrainz: global._listenbrainz });

/**
 * GET /api/catalog/search?q=copperhead — songs from the music catalog.
 *
 * Public: attendees use it to pick a song when requesting. The catalog grows
 * from MusicBrainz as people search (see lib/server/catalog/catalogSearch.js).
 * The catalog is CC0 MusicBrainz data, and only display fields are returned.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const q = String(req.query.q ?? '').slice(0, 100);
  const limit = Number(req.query.limit) || 10;

  const client = await clientPromise;
  const results = await search(client, q, { limit });

  // Briefly cacheable to absorb repeat requests, but short: a background
  // refresh may re-rank results within seconds. Empty answers aren't cached,
  // since a skipped MusicBrainz lookup may succeed on the next try.
  res.setHeader('Cache-Control', results.length ? 'public, max-age=10' : 'no-store');
  return res.status(200).json({ results });
}
