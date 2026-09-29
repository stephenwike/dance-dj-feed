import clientPromise, { DB_NAME } from './mongodb';

// Spotify tokens are stored per DJ: one spotify_tokens document per owner id.

export const SPOTIFY_STATE_COOKIE = 'spotify_oauth_state';

const SPOTIFY_API = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

async function tokensCol() {
  const client = await clientPromise;
  return client.db(DB_NAME).collection('spotify_tokens');
}

export async function getTokens(ownerId) {
  if (!ownerId) return null;
  const col = await tokensCol();
  return col.findOne({ _id: ownerId });
}

export async function saveTokens(ownerId, { access_token, refresh_token, expires_at }) {
  const col = await tokensCol();
  await col.updateOne(
    { _id: ownerId },
    { $set: { access_token, refresh_token, expires_at, updatedAt: new Date() } },
    { upsert: true }
  );
}

/** Exchange an OAuth authorization code (or refresh token) at Spotify's token endpoint. */
export async function requestToken(params) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      ...params,
      client_id: process.env.SPOTIFY_CLIENT_ID,
      client_secret: process.env.SPOTIFY_CLIENT_SECRET,
    }),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Token request failed: ${text.slice(0, 120)}`); }
  if (!res.ok) throw new Error(data.error_description || data.error || 'token_request_failed');
  return data;
}

async function refreshAccessToken(ownerId, tokens) {
  const data = await requestToken({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
  const updated = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  await saveTokens(ownerId, updated);
  return updated.access_token;
}

async function getAccessToken(ownerId) {
  const tokens = await getTokens(ownerId);
  if (!tokens?.access_token) throw new Error('not_connected');
  // Refresh if expiring within 2 minutes
  if (tokens.expires_at < Date.now() + 120_000) {
    if (!tokens.refresh_token) throw new Error('not_connected');
    return refreshAccessToken(ownerId, tokens);
  }
  return tokens.access_token;
}

export async function spotifyFetch(ownerId, path, options = {}) {
  const token = await getAccessToken(ownerId);
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
