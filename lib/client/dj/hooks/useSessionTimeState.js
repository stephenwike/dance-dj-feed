import { useState, useEffect, useCallback } from 'react';
// Same thresholds the server uses to lock and auto-close the session.
import { getSessionTimeState } from '../../../dj/sessionTimeState';

function formatCountdown(ms) {
  if (!ms || ms <= 0 || ms === Infinity) return '';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function useSessionTimeState(activeSession) {
  const endsAt = activeSession?.endsAt;

  const calc = useCallback(() => {
    const { state, msRemaining, msUntilAutoClose } = getSessionTimeState(endsAt ? { endsAt } : null);
    const displayMs = state === 'grace' ? msUntilAutoClose : msRemaining;
    return {
      timeState: state,
      msRemaining,
      msUntilAutoClose,
      countdown: formatCountdown(displayMs),
      isGrace: state === 'grace',
      isExpired: state === 'expired',
      needsAttention: state !== 'active',
    };
  }, [endsAt]);

  const [value, setValue] = useState(calc);

  useEffect(() => {
    setValue(calc());
    if (!endsAt) return;
    const id = setInterval(() => setValue(calc()), 1000);
    return () => clearInterval(id);
  }, [endsAt, calc]);

  return value;
}
