import clientPromise from '../../../lib/server/mongodb';
import { searchTracks } from '../../../lib/server/catalog/trackCatalog';

/**
 * GET /api/catalog/search?q=copperhead — songs from the music catalog.
 *
 * Public: attendees use it to pick a song when requesting. The catalog is
 * CC0 MusicBrainz data, and only display fields are returned.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const q = String(req.query.q ?? '').slice(0, 100);
  const limit = Number(req.query.limit) || 10;

  const client = await clientPromise;
  const results = await searchTracks(client, q, { limit });

  // Same query → same answer for a while; lets the browser/CDN absorb typing bursts.
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return res.status(200).json({ results });
}
