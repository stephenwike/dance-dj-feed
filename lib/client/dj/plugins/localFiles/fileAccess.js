/**
 * Browser access to the DJ's music folder (File System Access API). What the
 * plugin remembers between visits lives in libraryStore.js.
 *
 * Only Chromium browsers (Chrome, Edge) implement showDirectoryPicker, and
 * only they can keep a folder handle across reloads — so the plugin requires
 * them (see isSupported). Nothing here uploads files: they are read locally
 * and played from object URLs.
 */
import { isAudioFile } from './library';

export function isSupported() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** Ask the DJ to choose their music folder. Must run from a click handler. */
export async function pickFolder() {
  // `id` lets the browser reopen the picker where the DJ last left it.
  return window.showDirectoryPicker({ id: 'dj-music', mode: 'read' });
}

/** 'granted' | 'prompt' | 'denied' — read access to a stored folder handle. */
export async function permissionFor(handle) {
  return handle.queryPermission({ mode: 'read' });
}

/** Re-grant access after a reload. Must run from a click handler. */
export async function requestPermission(handle) {
  return handle.requestPermission({ mode: 'read' });
}

/**
 * Every audio file under `dir`, depth first, as { path, handle }.
 * Paths use "/" and are relative to `dir`.
 */
export async function listAudioFiles(dir, prefix = '') {
  const out = [];
  for await (const [name, handle] of dir.entries()) {
    const path = prefix + name;
    if (handle.kind === 'directory') {
      if (!name.startsWith('.')) out.push(...await listAudioFiles(handle, `${path}/`));
    } else if (isAudioFile(name)) {
      out.push({ path, handle });
    }
  }
  return out;
}

/** The File at `path` (relative to `root`), or null if it has moved or gone. */
export async function getFileAtPath(root, path) {
  const parts = path.split('/');
  const fileName = parts.pop();
  try {
    let dir = root;
    for (const part of parts) dir = await dir.getDirectoryHandle(part);
    const handle = await dir.getFileHandle(fileName);
    return await handle.getFile();
  } catch (err) {
    if (err.name === 'NotFoundError' || err.name === 'TypeMismatchError') return null;
    throw err;
  }
}
