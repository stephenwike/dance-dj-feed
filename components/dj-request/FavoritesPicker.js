import { useState, useMemo, useEffect } from 'react';
import { Heart, Check, ChevronDown, ChevronLeft, ChevronRight, Shuffle, Search, Trash2, FileText } from 'lucide-react';
import s from './FavoritesPicker.module.css';
import { diffColor } from '../dj-controller/utils';
import { rankBySearch } from '../../lib/client/dj/danceTextSearch';

const PAGE_SIZE = 8;
// A search box once the list is longer than a page.
const SEARCH_FROM = PAGE_SIZE + 1;

/** Signed out: what the favorites list would be, and a way in. */
export function FavoritesSignIn({ label, onSignIn }) {
  return (
    <button type="button" className={s.signIn} onClick={onSignIn}>
      <Heart size={15} fill="currentColor" className={s.headHeart} aria-hidden="true" />
      {label}
    </button>
  );
}

const CONFIRM_MS = 3000;

/**
 * Remove a favorite — it's shared with Line Dance Manager, so it takes two
 * taps: the first turns the button into "Remove?", a second within a few
 * seconds removes it.
 */
export function RemoveButton({ name, onRemove, listName = 'favorites' }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return undefined;
    const t = setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => clearTimeout(t);
  }, [confirming]);
  return (
    <button
      type="button"
      className={`${s.remove} ${confirming ? s.removeConfirm : ''}`}
      onClick={e => {
        e.stopPropagation();
        if (confirming) { setConfirming(false); onRemove(); } else setConfirming(true);
      }}
      aria-label={confirming ? `Confirm: remove ${name} from your ${listName}` : `Remove ${name} from your ${listName}`}
      title={confirming ? 'Tap again to remove' : `Remove from ${listName}`}
    >
      {confirming ? 'Remove?' : <Trash2 size={15} />}
    </button>
  );
}

/**
 * 📄 a dance's stepsheet, in a new tab. Where there's none, an empty space
 * (if `keepSpace`) so the buttons after it line up from row to row.
 */
function StepsheetLink({ item, keepSpace }) {
  if (!item.stepsheet) return keepSpace ? <span className={s.stepsheetSlot} aria-hidden="true" /> : null;
  return (
    <a
      className={s.stepsheet}
      href={item.stepsheet}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      aria-label={`Stepsheet for ${item.title}`}
      title="Stepsheet"
    >
      <FileText size={16} aria-hidden="true" />
    </a>
  );
}

function randomIndex(n, avoid) {
  if (n <= 1) return 0;
  let i;
  do { i = Math.floor(Math.random() * n); } while (i === avoid);
  return i;
}

/**
 * Request straight from your favorites, on the request form.
 *
 * Closed, it suggests one favorite you can request right now (picked at
 * random; 🔀 for another) with a one-tap Request. Open, it lists them all —
 * a page at a time, with a search box for long lists — to tick one, several
 * or all, then "Request selected". Each is sent as a normal request (joining
 * it when someone already asked for it). Favorites that can't be requested
 * right now — already yours, playing, played tonight — show why and can't
 * be ticked.
 *
 * Each favorite — the suggestion and every row — links to its stepsheet (📄)
 * and can be removed from your favorites (🗑, tap twice).
 *
 * `items` come from lib/client/dancer/favoriteRequests.js; `onRequest(payloads)`
 * sends them and resolves when done; `onRemove(item)` unfavorites one.
 */
export default function FavoritesPicker({ title, items, noun = 'dance', onRequest, onRemove }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [sending, setSending] = useState(false);
  const plural = n => `${n} ${noun}${n === 1 ? '' : 's'}`;

  // Forget picks that are no longer requestable (e.g. someone else just played it).
  const selectable = useMemo(() => items.filter(i => i.selectable), [items]);
  const selectableKeys = useMemo(() => new Set(selectable.map(i => i.key)), [selectable]);
  useEffect(() => {
    setPicked(prev => {
      const next = new Set([...prev].filter(k => selectableKeys.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [selectableKeys]);

  // The suggestion: a random requestable favorite, kept until shuffled or it
  // stops being requestable.
  const [suggestKey, setSuggestKey] = useState(null);
  useEffect(() => {
    if (!selectable.length) { setSuggestKey(null); return; }
    if (!suggestKey || !selectableKeys.has(suggestKey)) setSuggestKey(selectable[randomIndex(selectable.length)].key);
  }, [selectable, selectableKeys, suggestKey]);
  const suggestion = selectable.find(i => i.key === suggestKey) ?? null;
  function shuffle() {
    const at = selectable.findIndex(i => i.key === suggestKey);
    setSuggestKey(selectable[randomIndex(selectable.length, at)].key);
  }

  // Every word must match something about the favorite; name matches come
  // first, then song/artist, then choreographer (see danceTextSearch.js).
  const filtered = useMemo(() => rankBySearch(items, query, i => i.searchFields), [items, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageIndex = Math.min(page, pageCount - 1);
  const visible = filtered.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);
  useEffect(() => { setPage(0); }, [query]);

  if (!items.length) return null;

  const allPicked = selectableKeys.size > 0 && picked.size === selectableKeys.size;
  // Line dances have stepsheets; songs don't, so they don't keep the space.
  const hasStepsheets = items.some(i => i.stepsheet);

  function toggle(key) {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function send(payloads, after) {
    if (!payloads.length) return;
    setSending(true);
    try {
      await onRequest(payloads);
      after?.();
    } finally {
      setSending(false);
    }
  }

  return (
    <section className={s.picker}>
      <button type="button" className={s.head} onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <Heart size={15} fill="currentColor" className={s.headHeart} aria-hidden="true" />
        <span className={s.headTitle}>{title}</span>
        <span className={s.headCount}>{items.length}</span>
        <ChevronDown size={16} className={`${s.chevron} ${open ? s.chevronOpen : ''}`} aria-hidden="true" />
      </button>

      {!open && suggestion && (
        <div className={s.suggest}>
          <span className={s.suggestText}>
            <span className={s.suggestLead}>How about</span>
            <span className={s.title}>
              {suggestion.title}
              {suggestion.difficulty && <span className={s.diff} style={{ color: diffColor(suggestion.difficulty) }}>{suggestion.difficulty}</span>}
            </span>
            <span className={s.meta}>
              {suggestion.status.label && <span className={s[`status_${suggestion.status.type}`]}>{suggestion.status.label}</span>}
              {suggestion.status.label && suggestion.sub && ' · '}
              {suggestion.sub}
            </span>
          </span>
          {/* 📄 and 🗑 sit together, as in the list rows */}
          <span className={s.pair}>
            <StepsheetLink item={suggestion} />
            {onRemove && <RemoveButton name={suggestion.title} onRemove={() => onRemove(suggestion)} />}
          </span>
          {selectable.length > 1 && (
            <button type="button" className={s.shuffle} onClick={shuffle} aria-label={`Suggest another ${noun}`} title="Another one">
              <Shuffle size={16} />
            </button>
          )}
          <button type="button" className={s.suggestSend} onClick={() => send([suggestion.payload], shuffle)} disabled={sending}>
            {sending ? '…' : 'Request'}
          </button>
        </div>
      )}
      {!open && !suggestion && (
        <p className={s.allDone}>Nothing from your favorites can be requested right now.</p>
      )}

      {open && (
        <>
          <div className={s.toolbar}>
            {items.length >= SEARCH_FROM && (
              <label className={s.search}>
                <Search size={14} aria-hidden="true" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={`Find in your ${noun === 'song' ? 'favorite songs' : 'favorites'}`}
                  aria-label={`Find in your favorite ${noun}s`}
                />
              </label>
            )}
            {selectableKeys.size > 1 && (
              <button
                type="button"
                className={s.selectAll}
                onClick={() => setPicked(allPicked ? new Set() : new Set(selectableKeys))}
              >
                {allPicked ? 'Clear' : `Select all (${selectableKeys.size})`}
              </button>
            )}
          </div>

          {visible.length ? (
            <ul className={s.list}>
              {visible.map(i => {
                const isPicked = picked.has(i.key);
                return (
                  <li key={i.key} className={s.item}>
                    <button
                      type="button"
                      className={`${s.row} ${isPicked ? s.rowPicked : ''} ${i.selectable ? '' : s.rowDone}`}
                      onClick={() => i.selectable && toggle(i.key)}
                      disabled={!i.selectable}
                      aria-pressed={i.selectable ? isPicked : undefined}
                    >
                      <span className={`${s.box} ${isPicked ? s.boxOn : ''}`} aria-hidden="true">
                        {isPicked && <Check size={13} strokeWidth={3.5} />}
                      </span>
                      <span className={s.text}>
                        <span className={s.title}>
                          {i.title}
                          {i.difficulty && <span className={s.diff} style={{ color: diffColor(i.difficulty) }}>{i.difficulty}</span>}
                        </span>
                        {(i.sub || i.status.label) && (
                          <span className={s.meta}>
                            {i.status.label && <span className={s[`status_${i.status.type}`]}>{i.status.label}</span>}
                            {i.status.label && i.sub && ' · '}
                            {i.sub}
                          </span>
                        )}
                      </span>
                    </button>
                    <StepsheetLink item={i} keepSpace={hasStepsheets} />
                    {onRemove && <RemoveButton name={i.title} onRemove={() => onRemove(i)} />}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={s.allDone}>No favorites match “{query.trim()}”.</p>
          )}

          {pageCount > 1 && (
            <div className={s.pager}>
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

          <button
            type="button"
            className={s.send}
            onClick={() => send(items.filter(i => picked.has(i.key)).map(i => i.payload), () => setPicked(new Set()))}
            disabled={!picked.size || sending}
          >
            {sending ? 'Requesting…' : picked.size ? `Request ${plural(picked.size)}` : `Tick ${noun}s to request them`}
          </button>
        </>
      )}
    </section>
  );
}
