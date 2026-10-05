import { useState, useMemo, useEffect } from 'react';
import { Flag, ChevronDown, ChevronLeft, ChevronRight, Search, GraduationCap, FileText } from 'lucide-react';
import s from './FavoritesPicker.module.css';
import w from './WishlistPanel.module.css';
import { RemoveButton } from './FavoritesPicker';
import { diffColor } from '../dj-controller/utils';
import { rankBySearch } from '../../lib/client/dj/danceTextSearch';

const PAGE_SIZE = 8;

/**
 * Your wishlist: dances you want to learn. It's a signal for your
 * instructors (Line Dance Manager links dancers to their venues), not a way
 * to request, so each dance can only be marked Learned or removed.
 *
 *   🎓 Learned — off the wishlist, marked as known (and no longer "refresh")
 *   📄 Stepsheet — opens it in a new tab (when the dance has one)
 *   🗑 Remove — off the wishlist (tap twice)
 *
 * Closed by default; open, it's a page at a time with a search box for long
 * lists. Dances you already know and want to brush up on show "Refresh".
 * `items` come from favoriteRequests.wishlistItems.
 */
export default function WishlistPanel({ items, onLearned, onRemove }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  // Name matches first, then song/artist, then choreographer.
  const filtered = useMemo(() => rankBySearch(items, query, i => i.searchFields), [items, query]);
  useEffect(() => { setPage(0); }, [query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageIndex = Math.min(page, pageCount - 1);
  const visible = filtered.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);

  if (!items.length) return null;

  return (
    <section className={`${s.picker} ${w.panel}`}>
      <button type="button" className={s.head} onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <Flag size={15} fill="currentColor" className={w.flag} aria-hidden="true" />
        <span className={s.headTitle}>Your wishlist</span>
        <span className={`${s.headCount} ${w.count}`}>{items.length}</span>
        <ChevronDown size={16} className={`${s.chevron} ${open ? s.chevronOpen : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <>
          <p className={w.hint}>Dances you want to learn — your instructors can see these. Mark one Learned once you’ve got it.</p>

          {items.length > PAGE_SIZE && (
            <div className={s.toolbar}>
              <label className={s.search}>
                <Search size={14} aria-hidden="true" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Find in your wishlist"
                  aria-label="Find in your wishlist"
                />
              </label>
            </div>
          )}

          {visible.length ? (
            <ul className={s.list}>
              {visible.map(i => (
                <li key={i.key} className={s.item}>
                  <span className={w.row}>
                    <span className={s.text}>
                      <span className={s.title}>
                        {i.title}
                        {i.difficulty && <span className={s.diff} style={{ color: diffColor(i.difficulty) }}>{i.difficulty}</span>}
                      </span>
                      {(i.sub || i.refresh) && (
                        <span className={s.meta}>
                          {i.refresh && <span className={w.refresh}>Refresh</span>}
                          {i.refresh && i.sub && ' · '}
                          {i.sub}
                        </span>
                      )}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={w.learned}
                    onClick={() => onLearned(i)}
                    aria-label={`Mark ${i.title} as learned`}
                    title="I’ve learned it"
                  >
                    <GraduationCap size={15} aria-hidden="true" />
                    <span>Learned</span>
                  </button>
                  {i.stepsheet ? (
                    <a
                      className={s.stepsheet}
                      href={i.stepsheet}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Stepsheet for ${i.title}`}
                      title="Stepsheet"
                    >
                      <FileText size={16} aria-hidden="true" />
                    </a>
                  ) : <span className={s.stepsheetSlot} aria-hidden="true" />}
                  <RemoveButton name={i.title} listName="wishlist" onRemove={() => onRemove(i)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className={s.allDone}>Nothing on your wishlist matches “{query.trim()}”.</p>
          )}

          {pageCount > 1 && (
            <div className={`${s.pager} ${w.pager}`}>
              <button type="button" className={s.pageBtn} onClick={() => setPage(pageIndex - 1)} disabled={pageIndex === 0} aria-label="Previous page">
                <ChevronLeft size={16} />
              </button>
              <span className={s.pageInfo}>
                {pageIndex * PAGE_SIZE + 1}–{Math.min(filtered.length, (pageIndex + 1) * PAGE_SIZE)} of {filtered.length}
              </span>
              <button type="button" className={s.pageBtn} onClick={() => setPage(pageIndex + 1)} disabled={pageIndex >= pageCount - 1} aria-label="Next page">
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
