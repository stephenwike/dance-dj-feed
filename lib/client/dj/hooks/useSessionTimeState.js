import { useState, useEffect, useCallback } from 'react';

const WARNING_MS = 30 * 60 * 1000;
const URGENT_MS = 15 * 60 * 1000;
const GRACE_MS = 30 * 60 * 1000;

function computeState(endsAt) {
  if (!endsAt) return { state: 'active', msRemaining: Infinity, msUntilAutoClose: Infinity };
  const ms = new Date(endsAt).getTime() - Date.now();
  const autoClose = new Date(endsAt).getTime() + GRACE_MS - Date.now();
  if (ms > WARNING_MS) return { state: 'active', msRemaining: ms, msUntilAutoClose: autoClose };
  if (ms > URGENT_MS) return { state: 'warning', msRemaining: ms, msUntilAutoClose: autoClose };
  if (ms > 0) return { state: 'urgent', msRemaining: ms, msUntilAutoClose: autoClose };
  if (autoClose > 0) return { state: 'grace', msRemaining: 0, msUntilAutoClose: autoClose };
  return { state: 'expired', msRemaining: 0, msUntilAutoClose: 0 };
}

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
    const { state, msRemaining, msUntilAutoClose } = computeState(endsAt);
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
