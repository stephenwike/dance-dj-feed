import { spotifyFetch, getTokens } from '../../../lib/server/spotify';

// If Spotify returns "No active device", find any available device and
// transfer playback to it, then retry the original play command.
async function playWithFallback(playBody) {
  try {
    await spotifyFetch('/me/player/play', { method: 'PUT', body: JSON.stringify(playBody) });
  } catch (err) {
    if (!err.message.includes('No active device') && !err.message.includes('not available')) throw err;
    const devicesData = await spotifyFetch('/me/player/devices');
    const device = devicesData?.devices?.find(d => !d.is_restricted) ?? devicesData?.devices?.[0];
    if (!device) throw new Error('No Spotify devices found. Open Spotify on any device.');
    // Transfer playback to the device (without auto-playing so we can set context next)
    await spotifyFetch('/me/player', {
      method: 'PUT',
      body: JSON.stringify({ device_ids: [device.id], play: false }),
    });
    // Brief pause for device activation, then play with our context
    await new Promise(r => setTimeout(r, 800));
    await spotifyFetch('/me/player/play', { method: 'PUT', body: JSON.stringify(playBody) });
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // GET — current playback state + queue
  if (req.method === 'GET') {
    const tokens = await getTokens();
    if (!tokens?.access_token) return res.status(200).json({ connected: false });

    try {
      const [playback, queue] = await Promise.all([
        spotifyFetch('/me/player?additional_types=track'),
        spotifyFetch('/me/player/queue'),
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
      await spotifyFetch(`/me/player/queue?uri=${encodeURIComponent(uri)}`, { method: 'POST' });
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
        await playWithFallback(uris ? { uris } : {});
      } else if (action === 'pause') {
        await spotifyFetch('/me/player/pause', { method: 'PUT' });
      } else if (action === 'next') {
        await spotifyFetch('/me/player/next', { method: 'POST' });
      } else if (action === 'previous') {
        await spotifyFetch('/me/player/previous', { method: 'POST' });
      } else if (action === 'reorder') {
        const allUris = currentUri
          ? [currentUri, ...uris.filter(u => u !== currentUri)]
          : uris;
        await playWithFallback({
          uris: allUris,
          offset: { uri: currentUri || allUris[0] },
        });
      } else if (action === 'repeat') {
        const { state } = req.body ?? {};
        await spotifyFetch(`/me/player/repeat?state=${state ?? 'off'}`, { method: 'PUT' });
      } else if (action === 'seek') {
        const { position_ms } = req.body;
        await spotifyFetch(`/me/player/seek?position_ms=${position_ms}`, { method: 'PUT' });
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
