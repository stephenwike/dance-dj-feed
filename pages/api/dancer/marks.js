import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';
import clientPromise from '../../../lib/server/mongodb';
import { getDanceMarks, setDanceMark, markLearned, TOGGLE_KINDS } from '../../../lib/server/ldco/danceMarks';
import { getFavoriteSongDetails, setFavoriteSong } from '../../../lib/server/dancer/favoriteSongs';

/**
 * The signed-in dancer's marks:
 *   favorite / wishlist — catalog line dances, shared with Line Dance Manager
 *                         (lib/server/ldco/danceMarks.js)
 *   song                — favorite songs, for partner dances, by music
 *                         catalog id (lib/server/dancer/favoriteSongs.js)
 *
 * GET  → { favorite, wishlist, known, refresh: [danceId], song: [trackId],
 *          songs: [{ id, title, artist, durationMs }] }  (songs: for requesting)
 * POST { kind: 'favorite' | 'wishlist', danceId, on } → { danceId, kind, on, refresh? }
 *      (wishlisting a dance you already know also marks it refresh)
 * POST { kind: 'learned', danceId }                   → { danceId, learned }
 *      (off the wishlist, known, no longer refresh)
 * POST { kind: 'song', trackId, on }                  → { trackId, kind, on }
 */
export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Sign in to save favorites' });

  const client = await clientPromise;

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const [marks, songs] = await Promise.all([getDanceMarks(client, userId), getFavoriteSongDetails(client, userId)]);
    return res.status(200).json({ ...marks, song: songs.map(s => s.id), songs });
  }

  if (req.method === 'POST') {
    const { danceId, trackId, kind, on } = req.body ?? {};
    try {
      if (kind === 'song') {
        return res.status(200).json({ kind, ...(await setFavoriteSong(client, userId, { trackId, on: !!on })) });
      }
      if (kind === 'learned') {
        return res.status(200).json(await markLearned(client, userId, { danceId }));
      }
      if (!TOGGLE_KINDS.includes(kind)) return res.status(400).json({ error: 'kind must be favorite, wishlist, learned or song' });
      return res.status(200).json(await setDanceMark(client, userId, { danceId, kind, on: !!on }));
    } catch (err) {
      return res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
