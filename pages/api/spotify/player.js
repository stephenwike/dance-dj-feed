import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';
import { spotifyFetch, getTokens } from '../../../lib/server/spotify';

// If Spotify returns "No active device", find any available device and
// transfer playback to it, then retry the original play command.
async function playWithFallback(ownerId, playBody) {
  try {
    await spotifyFetch(ownerId, '/me/player/play', { method: 'PUT', body: JSON.stringify(playBody) });
  } catch (err) {
    if (!err.message.includes('No active device') && !err.message.includes('not available')) throw err;
    const devicesData = await spotifyFetch(ownerId, '/me/player/devices');
    const device = devicesData?.devices?.find(d => !d.is_restricted) ?? devicesData?.devices?.[0];
    if (!device) throw new Error('No Spotify devices found. Open Spotify on any device.');
    // Transfer playback to the device (without auto-playing so we can set context next)
    await spotifyFetch(ownerId, '/me/player', {
      method: 'PUT',
      body: JSON.stringify({ device_ids: [device.id], play: false }),
    });
    // Brief pause for device activation, then play with our context
    await new Promise(r => setTimeout(r, 800));
    await spotifyFetch(ownerId, '/me/player/play', { method: 'PUT', body: JSON.stringify(playBody) });
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // Each DJ controls only their own Spotify account.
  const session = await getServerSession(req, res, authOptions);
  const ownerId = session?.user?.id ?? null;
  if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });
  const sp = (path, options) => spotifyFetch(ownerId, path, options);

  // GET — current playback state + queue
  if (req.method === 'GET') {
    const tokens = await getTokens(ownerId);
    if (!tokens?.access_token) return res.status(200).json({ connected: false });

    try {
      const [playback, queue] = await Promise.all([
        sp('/me/player?additional_types=track'),
        sp('/me/player/queue'),
      ]);
      return res.status(200).json({ connected: true, playback, queue });
    } catch (err) {
      if (err.message === 'not_connected') return res.status(200).json({ connected: false });
      return res.status(200).json({ connected: true, playback: null, queue: null, error: err.message });
    }
  }

  // POST — add single URI to Spotify queue
  if (req.method === 'POST') {
    const { uri } = req.body ?? {};
    if (!uri) return res.status(400).json({ error: 'uri required' });
    try {
      await sp(`/me/player/queue?uri=${encodeURIComponent(uri)}`, { method: 'POST' });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // PUT — play / pause / skip / reorder
  if (req.method === 'PUT') {
    const { action, uris, currentUri, deviceId } = req.body ?? {};
    try {
      if (action === 'play') {
        await playWithFallback(ownerId, uris ? { uris } : {});
      } else if (action === 'pause') {
        await sp('/me/player/pause', { method: 'PUT' });
      } else if (action === 'next') {
        await sp('/me/player/next', { method: 'POST' });
      } else if (action === 'previous') {
        await sp('/me/player/previous', { method: 'POST' });
      } else if (action === 'reorder') {
        const allUris = currentUri
          ? [currentUri, ...uris.filter(u => u !== currentUri)]
          : uris;
        await playWithFallback(ownerId, {
          uris: allUris,
          offset: { uri: currentUri || allUris[0] },
        });
      } else if (action === 'repeat') {
        const { state } = req.body ?? {};
        const repeat = ['off', 'track', 'context'].includes(state) ? state : 'off';
        await sp(`/me/player/repeat?state=${repeat}`, { method: 'PUT' });
      } else if (action === 'seek') {
        const position = Math.max(0, Math.floor(Number(req.body.position_ms) || 0));
        await sp(`/me/player/seek?position_ms=${position}`, { method: 'PUT' });
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
