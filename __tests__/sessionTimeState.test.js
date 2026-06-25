'use strict';
const {
  getSessionTimeState,
  WARNING_THRESHOLD_MS,
  URGENT_THRESHOLD_MS,
  GRACE_PERIOD_MS,
} = require('../lib/server/dj/sessionTimeState');

function makeSession(endsAt) {
  return { endsAt: new Date(endsAt) };
}

describe('getSessionTimeState', () => {
  const BASE = new Date('2026-01-01T20:00:00Z').getTime();

  test('returns active when more than 30 min remain', () => {
    const session = makeSession(BASE + 60 * 60 * 1000);
    const result = getSessionTimeState(session, new Date(BASE));
    expect(result.state).toBe('active');
    expect(result.msRemaining).toBe(60 * 60 * 1000);
  });

  test('returns warning when 30-15 min remain', () => {
    const session = makeSession(BASE + 20 * 60 * 1000);
    const result = getSessionTimeState(session, new Date(BASE));
    expect(result.state).toBe('warning');
    expect(result.msRemaining).toBe(20 * 60 * 1000);
  });

  test('returns urgent when 15-0 min remain', () => {
    const session = makeSession(BASE + 10 * 60 * 1000);
    const result = getSessionTimeState(session, new Date(BASE));
    expect(result.state).toBe('urgent');
    expect(result.msRemaining).toBe(10 * 60 * 1000);
  });

  test('returns grace when past endsAt but within 30 min grace', () => {
    const session = makeSession(BASE - 10 * 60 * 1000);
    const result = getSessionTimeState(session, new Date(BASE));
    expect(result.state).toBe('grace');
    expect(result.msRemaining).toBe(0);
    expect(result.msUntilAutoClose).toBe(20 * 60 * 1000);
  });

  test('returns expired when past endsAt + 30 min grace', () => {
    const session = makeSession(BASE - 35 * 60 * 1000);
    const result = getSessionTimeState(session, new Date(BASE));
    expect(result.state).toBe('expired');
    expect(result.msRemaining).toBe(0);
    expect(result.msUntilAutoClose).toBe(0);
  });

  test('returns active with Infinity when session has no endsAt', () => {
    const result = getSessionTimeState({}, new Date(BASE));
    expect(result.state).toBe('active');
    expect(result.msRemaining).toBe(Infinity);
  });

  test('returns active with Infinity for null session', () => {
    const result = getSessionTimeState(null, new Date(BASE));
    expect(result.state).toBe('active');
  });

  test('boundary: exactly at warning threshold', () => {
    const session = makeSession(BASE + WARNING_THRESHOLD_MS);
    const result = getSessionTimeState(session, new Date(BASE));
    expect(result.state).toBe('warning');
  });

  test('boundary: exactly at urgent threshold', () => {
    const session = makeSession(BASE + URGENT_THRESHOLD_MS);
    const result = getSessionTimeState(session, new Date(BASE));
    expect(result.state).toBe('urgent');
  });

  test('boundary: exactly at endsAt', () => {
    const session = makeSession(BASE);
    const result = getSessionTimeState(session, new Date(BASE));
    expect(result.state).toBe('grace');
  });

  test('boundary: exactly at grace period end', () => {
    const session = makeSession(BASE - GRACE_PERIOD_MS);
    const result = getSessionTimeState(session, new Date(BASE));
    expect(result.state).toBe('expired');
  });
});
