const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'streaming',
].join(' ');

export default function handler(req, res) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/spotify/callback`,
    state: 'dj_spotify',
    show_dialog: 'false',
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
}
