/**
 * What the local-files plugin remembers in this browser (IndexedDB): the
 * music folder handle, the scanned index, and the DJ's chosen files for
 * catalog songs. Kept per DJ account, so DJs who share a computer and browser
 * profile each keep their own folder and choices.
 *
 * Nothing here leaves the browser.
 */
import { get, set, del } from 'idb-keyval';

// Where data lived before it was kept per DJ.
const LEGACY_KEYS = {
  folder: 'local-files:folder',
  index: 'local-files:index',
  links: 'local-files:catalog-links',
};

export function createLibraryStore(djId) {
  if (!djId) throw new Error('createLibraryStore needs the signed-in DJ id');
  const keys = {
    folder: `local-files:${djId}:folder`,
    index: `local-files:${djId}:index`,
    links: `local-files:${djId}:catalog-links`,
  };

  async function loadFolder() {
    return (await get(keys.folder)) ?? null;
  }

  return {
    /**
     * One-time move of data saved before it was kept per DJ. It goes to the
     * first DJ to open the plugin in this browser, who is who saved it in
     * every setup that existed then (one DJ per browser).
     */
    async adoptLegacyData() {
      for (const [name, legacyKey] of Object.entries(LEGACY_KEYS)) {
        const value = await get(legacyKey);
        if (value === undefined) continue;
        if ((await get(keys[name])) === undefined) await set(keys[name], value);
        await del(legacyKey);
      }
    },

    loadFolder,

    /** Remember `handle` and drop the index if it belongs to a different folder. */
    async saveFolder(handle) {
      const previous = await loadFolder();
      if (!previous || !(await previous.isSameEntry(handle))) await del(keys.index);
      await set(keys.folder, handle);
    },

    async loadIndex() {
      return (await get(keys.index)) ?? [];
    },

    async saveIndex(entries) {
      await set(keys.index, entries);
    },

    /**
     * Files the DJ has chosen for catalog songs: { catalogTrackId → file key }.
     * Kept apart from the index so choosing a different folder doesn't lose them.
     */
    async loadLinks() {
      return (await get(keys.links)) ?? {};
    },

    async saveLinks(links) {
      await set(keys.links, links);
    },
  };
}
