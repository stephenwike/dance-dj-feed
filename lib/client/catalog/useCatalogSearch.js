import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { fetcher } from '../fetcher';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

function useDebounced(value, ms) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Songs from the music catalog for a type-ahead (/api/catalog/search, which
 * falls back to MusicBrainz when the catalog has nothing). Waits for the user
 * to pause typing, and does nothing while `enabled` is false.
 *
 * @returns {{ results: Array, isLoading: boolean, isActive: boolean }}
 *   isActive — a search is in effect for the current query
 */
export function useCatalogSearch(query, { enabled = true, limit = 8 } = {}) {
  const debounced = useDebounced(query.trim(), DEBOUNCE_MS);
  const url = enabled && debounced.length >= MIN_QUERY_LENGTH
    ? `/api/catalog/search?q=${encodeURIComponent(debounced)}&limit=${limit}`
    : null;
  const { data, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  return { results: url ? (data?.results ?? []) : [], isLoading: !!url && isLoading, isActive: !!url };
}

/** "3:45" for a duration in ms, '' when unknown. */
export function formatDuration(ms) {
  if (!ms) return '';
  const secs = Math.round(ms / 1000);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

/** One-line description of a catalog song: "Artist · version · 1988 · 4:31". */
export function describeTrack(t, { withArtist = true } = {}) {
  return [withArtist && t.artist, t.disambiguation, t.year, formatDuration(t.durationMs)].filter(Boolean).join(' · ');
}
