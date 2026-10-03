import { useState, useEffect, useCallback } from 'react';

// The player routes audio through an AudioContext (see Deck), so speakers
// are chosen with AudioContext.setSinkId (Chrome/Edge 110+).
function isSupported() {
  return typeof window !== 'undefined'
    && typeof window.AudioContext === 'function'
    && typeof AudioContext.prototype.setSinkId === 'function'
    && !!navigator.mediaDevices?.enumerateDevices;
}

/**
 * Audio outputs (speakers, USB interfaces, HDMI) the player can send to.
 *
 * Browsers only name devices once the page has media permission, and Chrome
 * has no speaker-only permission — so requestAccess() asks for the
 * microphone and immediately releases it. Nothing is recorded.
 */
export function useOutputDevices(isActive) {
  const [supported, setSupported] = useState(false);
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    // Unnamed entries are placeholders shown before permission is granted.
    setDevices(all.filter(d => d.kind === 'audiooutput' && d.label).map(d => ({ id: d.deviceId, label: d.label })));
  }, []);

  useEffect(() => {
    if (!isActive || !isSupported()) return;
    setSupported(true);
    refresh().catch(() => {});
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh);
  }, [isActive, refresh]);

  const requestAccess = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      await refresh();
    } catch (err) {
      setError(err.name === 'NotAllowedError'
        ? 'Permission was declined, so only the default speakers can be used.'
        : err.message);
    }
  }, [refresh]);

  return { supported, devices, needsAccess: supported && devices.length === 0, requestAccess, error };
}
