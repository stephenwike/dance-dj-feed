import clientPromise from '../../../lib/server/mongodb';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const client = await clientPromise;
  const db = client.db('ldco');

  const [dances, tracks, choreographers] = await Promise.all([
    db.collection('dances').find({}).toArray(),
    db.collection('tracks').find({}).toArray(),
    db.collection('choreographers').find({}).toArray(),
  ]);

  // FK resolution maps
  const trackMap = Object.fromEntries(tracks.map(t => [String(t._id), t]));
  const choreoMap = Object.fromEntries(choreographers.map(c => [String(c._id), c.name]));

  const result = dances
    .map(d => {
      // primaryTrack is the canonical FK; fall back to first track if missing
      const track = trackMap[d.primaryTrack] ?? trackMap[d.tracks?.[0]] ?? null;

      return {
        id: String(d._id),
        danceName: d.danceName ?? '',
        difficulty: d.difficulty ?? '',
        stepsheet: d.stepsheet ?? '',
        primaryTrack: d.primaryTrack ?? '',
        songName: track?.name ?? '',
        artist: Array.isArray(track?.artists) ? track.artists.join(', ') : '',
        duration_ms: track?.duration_ms ?? null,
        spotifyUri: track?.uri ?? null,
        choreographers: (d.choreographers ?? [])
          .map(id => choreoMap[String(id)])
          .filter(Boolean),
      };
    })
    .sort((a, b) => a.danceName.localeCompare(b.danceName));

  res.status(200).json(result);
}
