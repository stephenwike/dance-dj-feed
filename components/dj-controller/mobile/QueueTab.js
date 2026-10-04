import { useState } from 'react';
import m from './mobile.module.css';
import Sheet, { MenuItem } from './Sheet';
import { trackTitle, trackSub } from './trackText';
import { formatTimestamp } from '../utils';

const TONE_CLASS = { danger: m.queueItemDanger, warning: m.queueItemWarning };

/**
 * The queue on a phone: one tappable card per dance; tapping opens its
 * actions. Reordering uses Move buttons rather than dragging — dragging
 * inside a scrolling list on a touch screen is easy to get wrong mid-set.
 *
 * `itemPlugin(request)` — the playback plugin's per-request UI (e.g. which
 * file will play), shown in the sheet.
 */
export default function QueueTab({ ctl, itemPlugin, onOpenPage }) {
  const { queue, playing, liveSession, handleAction, reorder, statsFor, queueTimes, itemTone } = ctl;
  const [selectedId, setSelectedId] = useState(null);
  const selectedIndex = queue.findIndex(r => r._id === selectedId);
  const selected = selectedIndex >= 0 ? queue[selectedIndex] : null;

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
        <div className={m.queueList}>
          {queue.map((r, i) => {
            const stats = statsFor(r);
            const tone = itemTone(r);
            const eta = queueTimes[r._id];
            return (
              <button key={r._id} className={`${m.queueItem} ${TONE_CLASS[tone] ?? ''}`} onClick={() => setSelectedId(r._id)}>
                <span className={m.queueIndex}>{i + 1}</span>
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
                <span className={m.moreDots}>⋯</span>
              </button>
            );
          })}
        </div>
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
            <MenuItem icon="🔼" label="Move up" onClick={() => move(selectedIndex - 1)} disabled={selectedIndex === 0} />
            <MenuItem icon="🔽" label="Move down" onClick={() => move(selectedIndex + 1)} disabled={selectedIndex === queue.length - 1} />
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
