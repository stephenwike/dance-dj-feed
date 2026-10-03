import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { isSupported, pickFolder, permissionFor, requestPermission, getFileAtPath } from './fileAccess';
import { createLibraryStore } from './libraryStore';
import { scanLibrary } from './scanLibrary';
import { buildLibraryIndex, EMPTY_INDEX } from './library';
import { migrateLinks, recordPlay as addPlay } from './requestIdentity';
import { normalizeSettings, sameSettings, DEFAULT_SETTINGS } from './trackSettings';
import { quantizePeaks, dequantizePeaks } from './waveform';
import { decodeWaveform } from './decodeWaveform';

/**
 * The signed-in DJ's local music library: which folder, whether the browser
 * may read it, and the searchable index of its tracks. Remembered per DJ
 * account (libraryStore.js), so DJs sharing a computer don't share folders.
 *
 * status:
 *   'unsupported' — browser lacks the File System Access API
 *   'loading'     — waiting for sign-in, or reading the remembered folder
 *   'no-folder'   — no folder chosen yet
 *   'needs-permission' — folder remembered, but access must be re-granted
 *                  with a click (browsers require this after a reload)
 *   'ready'       — index loaded (a background rescan may be running)
 */
export function useLocalLibrary(isActive) {
  const { data: authSession } = useSession();
  const djId = authSession?.user?.id ?? null;
  const store = useMemo(() => (djId ? createLibraryStore(djId) : null), [djId]);

  const [status, setStatus] = useState('loading');
  const [folderName, setFolderName] = useState(null);
  const [entries, setEntries] = useState([]);
  const [scan, setScan] = useState(null); // { done, total } while scanning
  const [error, setError] = useState(null);
  // { identityKey → file key }: files the DJ chose (requestIdentity.js).
  const [links, setLinks] = useState({});
  // { identityKey → { fileKey → { plays, swapPlays, last } } }: what played.
  const [history, setHistory] = useState({});
  // { fileKey → { volumeDb, inSec, outSec, tempo } }: saved per-file settings.
  const [trackSettings, setTrackSettings] = useState({});

  const rootRef = useRef(null);
  const scanningRef = useRef(false);
  const linksRef = useRef(links);
  const historyRef = useRef(history);
  const trackSettingsRef = useRef(trackSettings);
  const waveformsRef = useRef(new Map()); // fileKey → Promise<{ peaks, durationSec }>
  const loadedForRef = useRef(null); // the store whose data is loaded

  const rescan = useCallback(async () => {
    const root = rootRef.current;
    if (!store || !root || scanningRef.current) return;
    scanningRef.current = true;
    setError(null);
    try {
      const next = await scanLibrary(root, await store.loadIndex(), setScan);
      await store.saveIndex(next);
      setEntries(next);
    } catch (err) {
      setError(`Couldn't read the music folder: ${err.message}`);
    } finally {
      scanningRef.current = false;
      setScan(null);
    }
  }, [store]);

  // Show the cached index straight away, then refresh it in the background.
  const open = useCallback(async (root) => {
    rootRef.current = root;
    setFolderName(root.name);
    setEntries(await store.loadIndex());
    setStatus('ready');
    rescan();
  }, [store, rescan]);

  // Load this DJ's remembered folder when the plugin is first used (and again
  // if a different DJ signs in on this page).
  useEffect(() => {
    if (!isActive || !store || loadedForRef.current === store) return;
    loadedForRef.current = store;
    if (!isSupported()) { setStatus('unsupported'); return; }

    rootRef.current = null;
    setEntries([]);
    setFolderName(null);
    setError(null);
    setStatus('loading');
    (async () => {
      try {
        await store.adoptLegacyData();
        const saved = migrateLinks(await store.loadLinks());
        linksRef.current = saved;
        setLinks(saved);
        const played = await store.loadHistory();
        historyRef.current = played;
        setHistory(played);
        const perFile = await store.loadTrackSettings();
        trackSettingsRef.current = perFile;
        setTrackSettings(perFile);
        const root = await store.loadFolder();
        if (!root) { setStatus('no-folder'); return; }
        setFolderName(root.name);
        if (await permissionFor(root) === 'granted') await open(root);
        else { rootRef.current = root; setStatus('needs-permission'); }
      } catch (err) {
        setError(err.message);
        setStatus('no-folder');
      }
    })();
  }, [isActive, store, open]);

  const chooseFolder = useCallback(async () => {
    if (!store) return;
    try {
      const root = await pickFolder();
      await store.saveFolder(root);
      await open(root);
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message); // AbortError = picker cancelled
    }
  }, [store, open]);

  const reconnect = useCallback(async () => {
    const root = rootRef.current;
    if (!root) return;
    if (await requestPermission(root) === 'granted') await open(root);
    else setError('Permission to read the music folder was not granted.');
  }, [open]);

  const index = useMemo(() => (entries.length ? buildLibraryIndex(entries) : EMPTY_INDEX), [entries]);

  const getFile = useCallback(entry => getFileAtPath(rootRef.current, entry.key), []);

  /** Remember `fileKey` as this DJ's file for each identity key (dance or song). */
  const rememberLinks = useCallback((identityKeys, fileKey) => {
    if (!identityKeys.length) return;
    const next = { ...linksRef.current };
    for (const k of identityKeys) next[k] = fileKey;
    linksRef.current = next;
    setLinks(next);
    store?.saveLinks(next).catch(() => {});
  }, [store]);

  /** Note that `fileKey` played for `request` (loose dance/song associations). */
  const recordPlay = useCallback((request, fileKey) => {
    const next = addPlay(historyRef.current, request, fileKey);
    historyRef.current = next;
    setHistory(next);
    store?.saveHistory(next).catch(() => {});
  }, [store]);

  /**
   * The file's timeline waveform ({ peaks: 0..1[], durationSec }). Decoded
   * once per file version, then cached in memory and IndexedDB.
   */
  const waveformFor = useCallback(entry => {
    const cache = waveformsRef.current;
    const stamp = `${entry.size}:${entry.lastModified}`;
    const cacheKey = `${entry.key}|${stamp}`;
    if (!cache.has(cacheKey)) {
      const load = (async () => {
        const saved = await store?.loadWaveform(entry.key).catch(() => null);
        if (saved?.stamp === stamp) return { peaks: dequantizePeaks(saved.peaks), durationSec: saved.durationSec };
        const file = await getFileAtPath(rootRef.current, entry.key);
        if (!file) throw new Error('File not found');
        const { peaks, durationSec } = await decodeWaveform(file);
        store?.saveWaveform(entry.key, { stamp, durationSec, peaks: quantizePeaks(peaks) }).catch(() => {});
        return { peaks, durationSec };
      })();
      load.catch(() => cache.delete(cacheKey)); // let a failed decode be retried
      cache.set(cacheKey, load);
    }
    return cache.get(cacheKey);
  }, [store]);

  /** Saved settings for a file, or null if none. */
  const settingsFor = useCallback(entry => trackSettings[entry.key] ?? null, [trackSettings]);

  /** Save settings for a file; saving the defaults forgets them. */
  const saveTrackSettings = useCallback((fileKey, settings) => {
    const next = { ...trackSettingsRef.current };
    const clean = normalizeSettings(settings);
    if (sameSettings(clean, DEFAULT_SETTINGS)) delete next[fileKey];
    else next[fileKey] = clean;
    trackSettingsRef.current = next;
    setTrackSettings(next);
    store?.saveTrackSettings(next).catch(() => {});
  }, [store]);

  return {
    status, folderName, index, links, history, scan, error,
    chooseFolder, reconnect, rescan, getFile, rememberLinks, recordPlay,
    settingsFor, saveTrackSettings, waveformFor,
  };
}
