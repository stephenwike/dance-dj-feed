import m from './mobile.module.css';
import Sheet, { MenuItem } from './Sheet';

/**
 * Everything about the session from the header: switch between live
 * sessions (e.g. several floors), extend, end, start a new one.
 */
export default function SessionSheet({ ctl, onClose, onOpenPage }) {
  const { workingSession, liveSessions, liveSession } = ctl;
  const others = liveSessions.filter(s => s._id !== workingSession?._id);

  function endSession() {
    if (!window.confirm(`End "${liveSession.name}"? Requests close and the music stops.`)) return;
    ctl.closeSession();
    onClose();
  }

  return (
    <Sheet
      title={workingSession?.name ?? 'No session'}
      subtitle={workingSession ? sessionStatusText(ctl) : 'Go live with an event to take requests'}
      onClose={onClose}
    >
      {others.length > 0 && (
        <>
          <p className={m.sectionTitle}>Switch to</p>
          <div className={m.menu}>
            {others.map(s => (
              <MenuItem
                key={s._id}
                icon="🟢"
                label={s.name}
                hint="Live"
                onClick={() => { ctl.selectSession(s._id); onClose(); }}
              />
            ))}
          </div>
        </>
      )}

      <p className={m.sectionTitle}>This session</p>
      <div className={m.menu}>
        {liveSession && <MenuItem icon="⏱️" label="Extend session" hint="Add more time" onClick={() => { ctl.setShowExtendModal(true); onClose(); }} />}
        <MenuItem icon="⚙️" label="Session settings" onClick={() => { onOpenPage('settings'); onClose(); }} />
        {liveSession && <MenuItem icon="⏹️" label="End session" hint="Closes requests and stops the music" danger onClick={endSession} />}
      </div>

      <p className={m.sectionTitle}>Other</p>
      <div className={m.menu}>
        <MenuItem icon="➕" label="New event" hint="Start another event or floor" onClick={() => { window.location.href = '/dj-session-config'; }} />
        <MenuItem icon="📝" label="Your events" hint="Drafts you're planning, and live events" onClick={() => { window.location.href = '/start'; }} />
        <MenuItem icon="🗂️" label="All sessions" hint="Past sessions, reports, continue a closed one" onClick={() => { onOpenPage('sessions'); onClose(); }} />
      </div>
    </Sheet>
  );
}

/** "Live · ends in 1:42" for the header and sheet. */
export function sessionStatusText(ctl) {
  const s = ctl.workingSession;
  if (!s) return 'No session';
  if (ctl.timeState === 'grace') return 'Time is up — extend to keep going';
  return ctl.countdown ? `Live · ends in ${ctl.countdown}` : 'Live';
}
