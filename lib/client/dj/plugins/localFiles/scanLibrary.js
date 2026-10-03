/**
 * Build the library index for a music folder.
 *
 * Tag reading is the slow part, so files whose size and modified time match
 * the previous index are reused as-is; a rescan of an unchanged library only
 * walks the folder.
 */
import { listAudioFiles } from './fileAccess';
import { parseFilename } from './library';

// Bump when entries gain fields read from tags, so cached entries are re-read
// once. v2: ISRCs.
const ENTRY_VERSION = 2;

async function readTags(file) {
  // Loaded on first scan only, so the parser never ships to other plugins.
  const { parseBlob } = await import('music-metadata');
  const { common, format } = await parseBlob(file, { skipCovers: true });
  return {
    title: common.title ?? '',
    artist: common.artist ?? common.albumartist ?? '',
    album: common.album ?? '',
    durationMs: format.duration ? Math.round(format.duration * 1000) : null,
    isrcs: (common.isrc ?? []).map(i => String(i).replace(/[^A-Za-z0-9]/g, '').toUpperCase()).filter(Boolean),
  };
}

async function toEntry(path, file) {
  let tags = { title: '', artist: '', album: '', durationMs: null, isrcs: [] };
  try {
    tags = await readTags(file);
  } catch {
    // Unreadable or unusual tags — fall back to the filename below.
  }
  const guess = parseFilename(path);
  return {
    key: path,
    title: tags.title || guess.title,
    artist: tags.artist || guess.artist,
    album: tags.album,
    durationMs: tags.durationMs,
    isrcs: tags.isrcs,
    size: file.size,
    lastModified: file.lastModified,
    v: ENTRY_VERSION,
  };
}

/**
 * @param root      FileSystemDirectoryHandle for the music folder
 * @param previous  the last index for this folder (may be empty)
 * @param onProgress ({ done, total }) => void, called as files are processed
 * @returns library entries for every audio file now in the folder
 */
export async function scanLibrary(root, previous, onProgress = () => {}) {
  const cached = new Map(previous.map(e => [e.key, e]));
  const files = await listAudioFiles(root);
  const entries = [];
  onProgress({ done: 0, total: files.length });

  for (let i = 0; i < files.length; i++) {
    const { path, handle } = files[i];
    const file = await handle.getFile();
    const hit = cached.get(path);
    const unchanged = hit && hit.v === ENTRY_VERSION && hit.size === file.size && hit.lastModified === file.lastModified;
    entries.push(unchanged ? hit : await toEntry(path, file));
    if (i % 25 === 24 || i === files.length - 1) onProgress({ done: i + 1, total: files.length });
  }
  return entries;
}
