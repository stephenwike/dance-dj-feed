import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  isSupported, pickFolder, permissionFor, requestPermission,
  loadFolder, saveFolder, loadIndex, saveIndex, loadLinks, saveLinks, getFileAtPath,
} from './fileAccess';
import { scanLibrary } from './scanLibrary';
import { buildLibraryIndex, EMPTY_INDEX } from './library';

/**
 * The DJ's local music library: which folder, whether the browser may read
 * it, and the searchable index of its tracks.
 *
 * status:
 *   'unsupported' — browser lacks the File System Access API
 *   'loading'     — reading the remembered folder
 *   'no-folder'   — no folder chosen yet
 *   'needs-permission' — folder remembered, but access must be re-granted
 *                  with a click (browsers require this after a reload)
 *   'ready'       — index loaded (a background rescan may be running)
 */
export function useLocalLibrary(isActive) {
  const [status, setStatus] = useState('loading');
  const [folderName, setFolderName] = useState(null);
  const [entries, setEntries] = useState([]);
  const [scan, setScan] = useState(null); // { done, total } while scanning
  const [error, setError] = useState(null);
  // { catalogTrackId → file key }: files the DJ chose for catalog songs.
  const [links, setLinks] = useState({});

  const rootRef = useRef(null);
  const scanningRef = useRef(false);
  const startedRef = useRef(false);

  const rescan = useCallback(async () => {
    const root = rootRef.current;
    if (!root || scanningRef.current) return;
    scanningRef.current = true;
    setError(null);
    try {
      const next = await scanLibrary(root, await loadIndex(), setScan);
      await saveIndex(next);
      setEntries(next);
    } catch (err) {
      setError(`Couldn't read the music folder: ${err.message}`);
    } finally {
      scanningRef.current = false;
      setScan(null);
    }
  }, []);

  // Show the cached index straight away, then refresh it in the background.
  const open = useCallback(async (root) => {
    rootRef.current = root;
    setFolderName(root.name);
    setEntries(await loadIndex());
    setStatus('ready');
    rescan();
  }, [rescan]);

  // Restore the remembered folder the first time the plugin is used.
  useEffect(() => {
    if (!isActive || startedRef.current) return;
    startedRef.current = true;
    if (!isSupported()) { setStatus('unsupported'); return; }
    loadLinks().then(setLinks).catch(() => {});
    (async () => {
      try {
        const root = await loadFolder();
        if (!root) { setStatus('no-folder'); return; }
        setFolderName(root.name);
        if (await permissionFor(root) === 'granted') await open(root);
        else { rootRef.current = root; setStatus('needs-permission'); }
      } catch (err) {
        setError(err.message);
        setStatus('no-folder');
      }
    })();
  }, [isActive, open]);

  const chooseFolder = useCallback(async () => {
    try {
      const root = await pickFolder();
      await saveFolder(root);
      await open(root);
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message); // AbortError = picker cancelled
    }
  }, [open]);

  const reconnect = useCallback(async () => {
    const root = rootRef.current;
    if (!root) return;
    if (await requestPermission(root) === 'granted') await open(root);
    else setError('Permission to read the music folder was not granted.');
  }, [open]);

  const index = useMemo(() => (entries.length ? buildLibraryIndex(entries) : EMPTY_INDEX), [entries]);

  const getFile = useCallback(entry => getFileAtPath(rootRef.current, entry.key), []);

  /** Remember `key` as this DJ's file for a catalog song, for future requests. */
  const rememberLink = useCallback((catalogTrackId, key) => {
    setLinks(prev => {
      const next = { ...prev, [catalogTrackId]: key };
      saveLinks(next).catch(() => {});
      return next;
    });
  }, []);

  return { status, folderName, index, links, scan, error, chooseFolder, reconnect, rescan, getFile, rememberLink };
}
