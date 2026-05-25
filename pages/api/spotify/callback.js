import { saveTokens } from '../../../lib/server/spotify';

export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect(`/dj-spotify?spotify_error=${encodeURIComponent(error || 'no_code')}`);
  }

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/spotify/callback`,
      client_id: process.env.SPOTIFY_CLIENT_ID,
      client_secret: process.env.SPOTIFY_CLIENT_SECRET,
    }),
  });

  const data = await tokenRes.json();

  if (!tokenRes.ok) {
    return res.redirect(`/dj-spotify?spotify_error=${encodeURIComponent(data.error_description || 'token_failed')}`);
  }

  await saveTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  });

  res.redirect('/dj-spotify?spotify_connected=1');
}
