import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from './dj-plan.module.css';
import { fetcher } from '../lib/client/fetcher';
import { sortedQueue } from '../lib/client/dj/queue';
import { del } from '../lib/client/dj/requests';
import { useQueueReorder } from '../lib/client/dj/hooks/useQueueReorder';
import { SESSION_DURATIONS_BY_MINUTES } from '../lib/dj/sessionPricing';
import { musicSource } from '../lib/dj/musicSources';
import { trackTitle, trackSub } from '../components/dj-controller/trackText';
import DJAddPanel from '../components/dj-controller/DJAddPanel';

const verticalOnly = ({ transform }) => ({ ...transform, x: 0 });

/**
 * Plan the set: build and order a draft event's queue before it goes live.
 * Everything saves as you go (the dances are the draft's queued requests), so
 * going live starts the event with this queue ready in the controller.
 */
export default function PlanSetPage() {
  const router = useRouter();
  const { id } = router.query;
  const { data: session, error: sessionError } = useSWR(id ? `/api/dj/sessions/${id}` : null, fetcher, { revalidateOnFocus: false });
  const { data: requests = [], mutate } = useSWR(id ? `/api/dj/requests?sessionId=${id}` : null, fetcher, { revalidateOnFocus: false });

  // Once launched, the event belongs to the controller.
  useEffect(() => {
    if (session?.status === 'active') router.replace(`/dj-controller?session=${id}`);
  }, [session?.status]);

  const queue = sortedQueue(requests);
  const nextQueuePos = (queue.at(-1)?.queuePosition ?? 0) + 1;
  const reorder = useQueueReorder({ queue, mutate });
  // Mouse: drag after a few pixels. Touch: press and hold, so swipes still scroll.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } }),
  );
  const totalMs = queue.reduce((sum, r) => sum + (r.duration_ms || 180_000), 0);

  async function remove(requestId) {
    mutate(prev => prev.filter(r => r._id !== requestId), false);
    await del(requestId);
    mutate();
  }

  if (sessionError || session?.error) {
    return <Shell><p className={styles.notice}>This event couldn’t be found. <Link href="/start">Back to your events</Link></p></Shell>;
  }
  if (!session) return <Shell><p className={styles.notice}>Loading…</p></Shell>;
  if (session.status !== 'draft') return <Shell><p className={styles.notice}>Opening the controller…</p></Shell>;

  const tier = SESSION_DURATIONS_BY_MINUTES[session.durationMinutes];

  return (
    <Shell>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.kicker}>Planning · draft</span>
          <h1 className={styles.title}>{session.name}</h1>
          <span className={styles.meta}>
            {tier ? tier.label : 'No length set'} · {musicSource(session.plugin).label}
            {' · '}<Link href={`/dj-session-config?id=${id}&from=plan`} className={styles.metaLink}>Edit</Link>
          </span>
        </div>
      </header>

      <div className={styles.columns}>
        <section className={styles.addBox}>
          <DJAddPanel activeSession={session} nextQueuePos={nextQueuePos} mutate={mutate} />
        </section>

        <section className={styles.setBox}>
          <div className={styles.setHead}>
            <span className={styles.setTitle}>Your set</span>
            {queue.length > 0 && (
              <span className={styles.setMeta}>{queue.length} dance{queue.length === 1 ? '' : 's'} · about {formatSetLength(totalMs)}</span>
            )}
          </div>
          {queue.length === 0 ? (
            <p className={styles.empty}>Nothing planned yet. Dances you add show up here, in the order they’ll play when the session starts.</p>
          ) : (
            <>
              {queue.length > 1 && <p className={styles.hint}>Drag to reorder (press and hold on a phone).</p>}
              <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[verticalOnly]} onDragEnd={reorder.handleDragEnd}>
                <SortableContext items={queue.map(r => r._id)} strategy={verticalListSortingStrategy}>
                  {/* Scrolls on its own, so a long set never pushes Start session away. */}
                  <div className={styles.setScroll}>
                  <ol className={styles.setList}>
                    {queue.map((r, i) => <PlannedDance key={r._id} request={r} index={i} onRemove={() => remove(r._id)} />)}
                  </ol>
                  </div>
                </SortableContext>
              </DndContext>
            </>
          )}
        </section>
      </div>

      {/* Fixed to the bottom of the screen: Start session is always in reach. */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span className={styles.saved}>✓ Saved as you go — come back any time from Your events.</span>
          <div className={styles.footerActions}>
            <Link href="/start" className={styles.done}>Done for now</Link>
            <Link href={`/dj-start-session?id=${id}&from=plan`} className={styles.start}>▶ Start session</Link>
          </div>
        </div>
      </footer>
    </Shell>
  );
}

/** "45 min" / "1 h 20 min" */
function formatSetLength(ms) {
  const minutes = Math.round(ms / 60000);
  const h = Math.floor(minutes / 60);
  return h ? `${h} h${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`;
}

function Shell({ children }) {
  return (
    <>
      <Head>
        <title>Plan the Set</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <div className={styles.backdrop}>
        <div className={styles.page}>
          <nav className={styles.nav}><Link href="/start" className={styles.navLink}>← Your events</Link></nav>
          {children}
        </div>
      </div>
    </>
  );
}

/** One planned dance: drag anywhere on the row, ✕ to remove. */
function PlannedDance({ request: r, index, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: r._id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${styles.setItem} ${isDragging ? styles.setItemDragging : ''}`}
      onContextMenu={e => e.preventDefault()}
      {...attributes}
      {...listeners}
    >
      <span className={styles.setIndex}>{index + 1}</span>
      <span className={styles.setInfo}>
        <span className={styles.setName}>{trackTitle(r)}</span>
        {trackSub(r) && <span className={styles.setSong}>{trackSub(r)}</span>}
      </span>
      <button
        type="button"
        className={styles.setRemove}
        onPointerDown={e => e.stopPropagation()}
        onClick={onRemove}
        aria-label={`Remove ${trackTitle(r)}`}
      >
        ✕
      </button>
    </li>
  );
}
