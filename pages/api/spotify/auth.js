import crypto from 'crypto';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';
import { SPOTIFY_STATE_COOKIE } from '../../../lib/server/spotify';

const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'streaming',
].join(' ');

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });

  // Random, single-use state bound to this browser — the callback rejects any
  // response whose state does not match (OAuth CSRF protection).
  const state = crypto.randomBytes(16).toString('hex');
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SPOTIFY_STATE_COOKIE}=${state}; Path=/api/spotify; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/spotify/callback`,
    state,
    show_dialog: 'false',
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
}
