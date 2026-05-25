import { spotifyFetch } from '../../../lib/server/spotify';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { q } = req.query;
  if (!q?.trim()) return res.status(400).json({ error: 'query required' });

  try {
    const data = await spotifyFetch(
      `/search?q=${encodeURIComponent(q)}&type=track&limit=8`
    );
    const tracks = (data?.tracks?.items ?? []).map(t => ({
      id: t.id,
      uri: t.uri,
      name: t.name,
      artists: t.artists.map(a => a.name).join(', '),
      album: t.album.name,
      duration_ms: t.duration_ms,
      image: t.album.images?.[2]?.url ?? t.album.images?.[0]?.url ?? null,
    }));
    return res.status(200).json(tracks);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
