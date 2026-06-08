import clientPromise, { DB_NAME } from './mongodb';

const SPOTIFY_API = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

async function tokensCol() {
  const client = await clientPromise;
  return client.db(DB_NAME).collection('spotify_tokens');
}

export async function getTokens() {
  const col = await tokensCol();
  return col.findOne({ _id: 'main' });
}

export async function saveTokens({ access_token, refresh_token, expires_at }) {
  const col = await tokensCol();
  await col.updateOne(
    { _id: 'main' },
    { $set: { access_token, refresh_token, expires_at, updatedAt: new Date() } },
    { upsert: true }
  );
}

export async function refreshAccessToken() {
  const tokens = await getTokens();
  if (!tokens?.refresh_token) throw new Error('not_connected');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: process.env.SPOTIFY_CLIENT_ID,
      client_secret: process.env.SPOTIFY_CLIENT_SECRET,
    }),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Token refresh failed: ${text.slice(0, 120)}`); }
  if (!res.ok) throw new Error(data.error_description || data.error || 'token_refresh_failed');

  const updated = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  await saveTokens(updated);
  return updated.access_token;
}

export async function getAccessToken() {
  const tokens = await getTokens();
  if (!tokens?.access_token) throw new Error('not_connected');
  // Refresh if expiring within 2 minutes
  if (tokens.expires_at < Date.now() + 120_000) {
    return refreshAccessToken();
  }
  return tokens.access_token;
}

export async function spotifyFetch(path, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${SPOTIFY_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 204 || res.status === 202) return null;

  const body = await res.text();
  if (!res.ok) {
    let msg = `Spotify ${res.status}`;
    try { msg = JSON.parse(body).error?.message || msg; } catch {}
    throw new Error(msg);
  }
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    // Some Spotify endpoints return 200 with a non-JSON body — treat as success
    return null;
  }
}

