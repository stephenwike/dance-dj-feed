import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';
import { saveTokens, requestToken, SPOTIFY_STATE_COOKIE } from '../../../lib/server/spotify';

function fail(res, reason) {
  return res.redirect(`/dj-controller?spotify_error=${encodeURIComponent(reason)}`);
}

export default async function handler(req, res) {
  const { code, error, state } = req.query;

  // Consume the state cookie whatever the outcome.
  const expectedState = req.cookies?.[SPOTIFY_STATE_COOKIE];
  res.setHeader('Set-Cookie', `${SPOTIFY_STATE_COOKIE}=; Path=/api/spotify; HttpOnly; SameSite=Lax; Max-Age=0`);

  if (error || !code) return fail(res, error || 'no_code');
  if (!state || state !== expectedState) return fail(res, 'state_mismatch');

  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id ?? null;
  if (!userId) return fail(res, 'not_signed_in');

  let data;
  try {
    data = await requestToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/spotify/callback`,
    });
  } catch (err) {
    return fail(res, err.message || 'token_failed');
  }

  await saveTokens(userId, {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  });

  res.redirect('/dj-controller?spotify_connected=1');
}
