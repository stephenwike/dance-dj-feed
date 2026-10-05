import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import useSWR from 'swr';
import { fetcher } from '../fetcher';

const MARKS_URL = '/api/dancer/marks';
const EMPTY = { favorite: [], wishlist: [], known: [], refresh: [], song: [], songs: [] };
const TOAST_MS = 2600;

// What a toast says for each mark, turned on or off.
const TOAST_TEXT = {
  favorite: [name => `${name} added to your favorites`, name => `${name} removed from your favorites`],
  wishlist: [name => `${name} added to your wishlist`, name => `${name} removed from your wishlist`],
  song: [name => `${name} added to your favorite songs`, name => `${name} removed from your favorite songs`],
};

/**
 * The signed-in dancer's marks — favorite and wishlist line dances (shared
 * with Line Dance Manager, by dance id) and favorite songs (partner dances,
 * by music catalog id) — and a toggle that updates at once and saves in the
 * background.
 *
 * Each toggle also sets `toast` ({ id, kind, on, text, error? }) for the
 * page to show, cleared after a moment; if saving fails the mark goes back
 * and the toast says so.
 * Signed out, nothing is fetched and every dance reads as unmarked.
 */
export function useDanceMarks(isSignedIn) {
  const { data, mutate } = useSWR(isSignedIn ? MARKS_URL : null, fetcher, { revalidateOnFocus: true });
  const marks = data ?? EMPTY;
  const sets = useMemo(() => ({
    favorite: new Set(marks.favorite),
    wishlist: new Set(marks.wishlist),
    song: new Set(marks.song ?? []),
    known: new Set(marks.known ?? []),
    refresh: new Set(marks.refresh ?? []),
  }), [marks]);

  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const showToast = useCallback(next => {
    clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), ...next });
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  // `id` is a dance id (favorite, wishlist) or a catalog track id (song).
  const has = useCallback((kind, id) => !!id && sets[kind].has(String(id)), [sets]);

  /** Toggle a mark; `name` is the dance or song, for the toast. */
  const toggle = useCallback(async (kind, rawId, name = 'Dance') => {
    const id = String(rawId);
    const on = !sets[kind].has(id);
    showToast({ kind, on, text: TOAST_TEXT[kind][on ? 0 : 1](name) });
    // Show the change straight away; put it back if saving fails.
    await mutate(async current => {
      const res = await fetch(MARKS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, on, ...(kind === 'song' ? { trackId: id } : { danceId: id }) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save');
      return withMark(current ?? EMPTY, kind, id, on);
    }, {
      optimisticData: current => withMark(current ?? EMPTY, kind, id, on),
      rollbackOnError: true,
      // Re-fetch when the server adds to it: a new favorite song needs its
      // title and artist; wishlisting a dance you know also marks it refresh.
      revalidate: kind === 'song' || (kind === 'wishlist' && on),
    }).catch(() => {
      showToast({ kind, on, error: true, text: `Couldn’t save that — check your connection and try again.` });
    });
  }, [sets, mutate, showToast]);

  /** "I've learned it": off the wishlist, known, no longer refresh. */
  const learn = useCallback(async (rawId, name = 'Dance') => {
    const id = String(rawId);
    showToast({ kind: 'learned', on: true, text: `${name} marked as learned` });
    const learned = current => {
      const m = current ?? EMPTY;
      return {
        ...m,
        wishlist: (m.wishlist ?? []).filter(x => x !== id),
        refresh: (m.refresh ?? []).filter(x => x !== id),
        known: [...(m.known ?? []).filter(x => x !== id), id],
      };
    };
    await mutate(async current => {
      const res = await fetch(MARKS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'learned', danceId: id }),
      });
      if (!res.ok) throw new Error('Could not save');
      return learned(current);
    }, { optimisticData: learned, rollbackOnError: true, revalidate: false }).catch(() => {
      showToast({ kind: 'learned', on: true, error: true, text: `Couldn’t save that — check your connection and try again.` });
    });
  }, [mutate, showToast]);

  /** Show a toast of the page's own (e.g. "Requested 3 dances"). */
  const notify = useCallback((text, { kind = 'favorite', error = false } = {}) => {
    showToast({ kind, on: true, error, text });
  }, [showToast]);

  return {
    has,
    toggle,
    learn,
    toast,
    notify,
    loaded: !!data,
    favoriteIds: marks.favorite,
    wishlistIds: marks.wishlist,
    refreshIds: marks.refresh ?? [],
    // Favorite songs with title/artist (for requesting from them).
    favoriteSongs: marks.songs ?? [],
  };
}

function withMark(marks, kind, id, on) {
  const list = (marks[kind] ?? []).filter(x => x !== id);
  return { ...marks, [kind]: on ? [...list, id] : list };
}
