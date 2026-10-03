'use strict';
const {
  isSessionOwner, sanitizeCreateBody, createBlockedReason, redactForViewer, withoutDjOnlyFields,
} = require('../lib/server/dj/requestAccess');

const session = { _id: 's1', ownerId: 'dj1', status: 'active' };

describe('isSessionOwner', () => {
  test('true only for the signed-in owner', () => {
    expect(isSessionOwner(session, 'dj1')).toBe(true);
    expect(isSessionOwner(session, 'someone-else')).toBe(false);
    expect(isSessionOwner(session, null)).toBe(false);
    expect(isSessionOwner(null, 'dj1')).toBe(false);
  });
});

describe('sanitizeCreateBody', () => {
  const body = { danceName: 'Waterfall', status: 'approved', queuePosition: 1, tipCents: 500, localTrackKey: 'a.mp3', clientId: 'anon_1' };

  test('attendees cannot set status, queuePosition, tipCents or localTrackKey', () => {
    const clean = sanitizeCreateBody(body, { isOwner: false });
    expect(clean).toEqual({ danceName: 'Waterfall', clientId: 'anon_1' });
  });

  test('attendees cannot pose as a system requester', () => {
    expect(sanitizeCreateBody({ danceName: 'X', clientId: 'dj' }, { isOwner: false }).clientId).toBeUndefined();
    expect(sanitizeCreateBody({ danceName: 'X', clientId: 'spotify' }, { isOwner: false }).clientId).toBeUndefined();
  });

  test('owners keep every field', () => {
    expect(sanitizeCreateBody(body, { isOwner: true })).toEqual(body);
  });

  test('does not mutate the input', () => {
    sanitizeCreateBody(body, { isOwner: false });
    expect(body.status).toBe('approved');
  });
});

describe('createBlockedReason', () => {
  test('allows attendees in an active session', () => {
    expect(createBlockedReason(session, 'anon_1', { isOwner: false })).toBeNull();
  });

  test('blocks attendees when the session is missing, not active, or paused', () => {
    expect(createBlockedReason(null, 'anon_1', { isOwner: false })).toBeTruthy();
    expect(createBlockedReason({ ...session, status: 'draft' }, 'anon_1', { isOwner: false })).toBeTruthy();
    expect(createBlockedReason({ ...session, status: 'closed' }, 'anon_1', { isOwner: false })).toBeTruthy();
    expect(createBlockedReason({ ...session, requestsEnabled: false }, 'anon_1', { isOwner: false })).toBeTruthy();
  });

  test('blocks suppressed attendees', () => {
    const s = { ...session, suppressedClientIds: ['anon_1'] };
    expect(createBlockedReason(s, 'anon_1', { isOwner: false })).toBeTruthy();
    expect(createBlockedReason(s, 'anon_2', { isOwner: false })).toBeNull();
  });

  test('never blocks the owner (e.g. pre-loading a draft)', () => {
    expect(createBlockedReason({ ...session, status: 'draft', requestsEnabled: false }, 'dj', { isOwner: true })).toBeNull();
  });
});

describe('redactForViewer', () => {
  const requests = [
    { _id: 'r1', clientId: 'anon_me', danceName: 'A' },
    { _id: 'r2', clientId: 'anon_other', danceName: 'B', requesterName: 'User_123' },
    { _id: 'r3', clientId: 'dj', danceName: 'C' },
    { _id: 'r4', clientId: '', danceName: 'D' },
  ];

  test("keeps the viewer's own clientId and hides everyone else's", () => {
    const out = redactForViewer(requests, 'anon_me');
    expect(out[0].clientId).toBe('anon_me');
    expect(out[1]).not.toHaveProperty('clientId');
    expect(out[1].requesterName).toBe('User_123');
  });

  test('leaves system requesters and blank ids alone', () => {
    const out = redactForViewer(requests, 'anon_me');
    expect(out[2].clientId).toBe('dj');
    expect(out[3].clientId).toBe('');
  });

  test("hides the DJ's file paths from everyone, including on the viewer's own and system requests", () => {
    const withFiles = requests.map(r => ({ ...r, localTrackKey: 'Partner/Song.mp3' }));
    for (const r of redactForViewer(withFiles, 'anon_me')) expect(r).not.toHaveProperty('localTrackKey');
  });

  test('with no viewer id, hides every attendee id', () => {
    const out = redactForViewer(requests, null);
    expect(out[0]).not.toHaveProperty('clientId');
    expect(out[1]).not.toHaveProperty('clientId');
  });
});

describe('withoutDjOnlyFields', () => {
  test('removes the local file path and keeps everything else', () => {
    const r = { _id: 'r1', danceName: 'A', localTrackKey: 'x.mp3', catalogTrackId: 'musicbrainz:1' };
    expect(withoutDjOnlyFields(r)).toEqual({ _id: 'r1', danceName: 'A', catalogTrackId: 'musicbrainz:1' });
    expect(r.localTrackKey).toBe('x.mp3'); // input untouched
  });

  test('returns requests without private fields as-is', () => {
    const r = { _id: 'r1' };
    expect(withoutDjOnlyFields(r)).toBe(r);
  });
});
