import { useState, useRef } from 'react';
import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import m from './mobile.module.css';
import Sheet, { MenuItem } from './Sheet';
import { trackTitle, trackSub } from './trackText';
import { formatTimestamp } from '../utils';

const TONE_CLASS = { danger: m.queueItemDanger, warning: m.queueItemWarning };

// Press and hold this long to pick a card up. Moving the finger further than
// LONG_PRESS_TOLERANCE_PX first is a scroll, not a drag.
const LONG_PRESS_MS = 350;
const LONG_PRESS_TOLERANCE_PX = 8;

// Cards only move up and down.
const verticalOnly = ({ transform }) => ({ ...transform, x: 0 });

/**
 * The queue on a phone: one card per dance. Tap a card for its actions;
 * press and hold to pick it up and drag it anywhere in the queue (the same
 * save path as dragging on the desktop). A quick swipe still scrolls.
 *
 * `itemPlugin(request)` — the playback plugin's per-request UI (e.g. which
 * file will play), shown in the sheet.
 */
export default function QueueTab({ ctl, itemPlugin, onOpenPage }) {
  const { queue, playing, liveSession, handleAction, reorder, statsFor, queueTimes, itemTone } = ctl;
  const [selectedId, setSelectedId] = useState(null);
  const selectedIndex = queue.findIndex(r => r._id === selectedId);
  const selected = selectedIndex >= 0 ? queue[selectedIndex] : null;

  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: LONG_PRESS_MS, tolerance: LONG_PRESS_TOLERANCE_PX } }),
    useSensor(MouseSensor, { activationConstraint: { delay: LONG_PRESS_MS, tolerance: LONG_PRESS_TOLERANCE_PX } }),
  );
  // A drag ends with the finger lifting, which some browsers report as a tap.
  const dragEndedAtRef = useRef(0);
  const onDragStart = () => navigator.vibrate?.(15);
  const onDragEnd = event => { dragEndedAtRef.current = Date.now(); reorder.handleDragEnd(event); };
  const onDragCancel = () => { dragEndedAtRef.current = Date.now(); };
  const openItem = id => { if (Date.now() - dragEndedAtRef.current > 300) setSelectedId(id); };

  const act = (action, extra) => { handleAction(selected._id, action, extra); setSelectedId(null); };
  const move = index => { reorder.moveTo(selected._id, index); setSelectedId(null); };
  const edit = () => {
    ctl.setEditingGroup({ requests: [selected], danceName: selected.danceName, difficulty: selected.difficulty || '' });
    setSelectedId(null);
  };

  return (
    <>
      <div className={m.toolbar}>
        <button className={m.toolbarBtn} onClick={() => onOpenPage('add')} disabled={!ctl.workingSession}>➕ Add to queue</button>
        {liveSession && playing.length === 0 && queue.length > 0 && (
          <button className={m.toolbarBtn} onClick={() => handleAction(queue[0]._id, 'startQueue')}>▶ Start queue</button>
        )}
      </div>

      {queue.length === 0 ? (
        <p className={m.empty}>The queue is empty.<br />Approve requests in the Requests tab, or add a dance yourself.</p>
      ) : (
        <>
          {queue.length > 1 && <p className={m.queueHint}>Press and hold a dance to drag it into a new spot.</p>}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[verticalOnly]}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
          >
            <SortableContext items={queue.map(r => r._id)} strategy={verticalListSortingStrategy}>
              <div className={m.queueList}>
                {queue.map((r, i) => (
                  <QueueCard
                    key={r._id}
                    request={r}
                    index={i}
                    stats={statsFor(r)}
                    tone={itemTone(r)}
                    eta={queueTimes[r._id]}
                    onOpen={() => openItem(r._id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      {selected && (
        <Sheet
          title={trackTitle(selected)}
          subtitle={[trackSub(selected), `#${selectedIndex + 1} in the queue`].filter(Boolean).join(' · ')}
          onClose={() => setSelectedId(null)}
        >
          {itemPlugin && <div className={m.sheetPlugin}>{itemPlugin(selected)}</div>}
          <div className={m.menu}>
            <MenuItem icon="⏫" label="Play next" hint="Move to the top of the queue" onClick={() => move(0)} disabled={selectedIndex === 0} />
            <MenuItem icon="⏬" label="Play last" hint="Move to the end of the queue" onClick={() => move(queue.length - 1)} disabled={selectedIndex === queue.length - 1} />
            {selected.danceType !== 'message' && <MenuItem icon="✏️" label="Edit" hint="Name, song, difficulty" onClick={edit} />}
            {selected.danceType !== 'message' && (
              <MenuItem icon="↩️" label="Back to requests" hint="Take it out of the queue, keep the request" onClick={() => act('dequeue')} />
            )}
            <MenuItem icon="✅" label={selected.danceType === 'message' ? 'Done' : 'Mark played'} onClick={() => act('played')} />
            <MenuItem icon="🗑️" label="Remove" hint="Deny the request" danger onClick={() => act('remove')} />
          </div>
        </Sheet>
      )}
    </>
  );
}

/** One queue card: tap for actions, press and hold to drag. */
function QueueCard({ request: r, index, stats, tone, eta, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: r._id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <button
      ref={setNodeRef}
      style={style}
      className={`${m.queueItem} ${TONE_CLASS[tone] ?? ''} ${isDragging ? m.queueItemDragging : ''}`}
      onClick={onOpen}
      onContextMenu={e => e.preventDefault()}
      {...attributes}
      {...listeners}
    >
      <span className={m.queueIndex}>{index + 1}</span>
      <span className={m.queueInfo}>
        <span className={m.queueName}>{trackTitle(r)}</span>
        {trackSub(r) && <span className={m.queueSong}>{trackSub(r)}</span>}
        <span className={m.queueMeta}>
          {r.danceType === 'partner' && <span className={`${m.tag} ${m.tagPartner}`}>Partner</span>}
          {r.isSongSwap && <span className={`${m.tag} ${m.tagSwap}`}>Swap</span>}
          {tone === 'danger' && <span className={`${m.tag} ${m.tagFile}`}>No file</span>}
          {eta && <span>🕒 {formatTimestamp(eta)}</span>}
          {r.danceType !== 'message' && <span>👥 {stats.count || 1}</span>}
          {stats.beats > 0 && <span>🪙 {stats.beats}</span>}
        </span>
      </span>
      <span className={m.dragGrip} aria-hidden="true">⠿</span>
    </button>
  );
}
