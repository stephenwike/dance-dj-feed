'use strict';

const WARNING_THRESHOLD_MS = 30 * 60 * 1000;
const URGENT_THRESHOLD_MS = 15 * 60 * 1000;
const GRACE_PERIOD_MS = 30 * 60 * 1000;

function getSessionTimeState(session, now = new Date()) {
  if (!session || !session.endsAt) {
    return { state: 'active', msRemaining: Infinity, msUntilAutoClose: Infinity };
  }

  const endsAt = new Date(session.endsAt).getTime();
  const nowMs = now instanceof Date ? now.getTime() : now;
  const msRemaining = endsAt - nowMs;
  const msUntilAutoClose = endsAt + GRACE_PERIOD_MS - nowMs;

  if (msRemaining > WARNING_THRESHOLD_MS) {
    return { state: 'active', msRemaining, msUntilAutoClose };
  }
  if (msRemaining > URGENT_THRESHOLD_MS) {
    return { state: 'warning', msRemaining, msUntilAutoClose };
  }
  if (msRemaining > 0) {
    return { state: 'urgent', msRemaining, msUntilAutoClose };
  }
  if (msUntilAutoClose > 0) {
    return { state: 'grace', msRemaining: 0, msUntilAutoClose };
  }
  return { state: 'expired', msRemaining: 0, msUntilAutoClose: 0 };
}

module.exports = {
  getSessionTimeState,
  WARNING_THRESHOLD_MS,
  URGENT_THRESHOLD_MS,
  GRACE_PERIOD_MS,
};
