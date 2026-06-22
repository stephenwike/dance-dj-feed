'use strict';
const { buildRequesterGroups } = require('../lib/client/dj/requesterGroups');

const makeReq = (overrides) => ({
  _id: 'r' + Math.random(),
  clientId: null,
  requesterName: null,
  danceName: 'Dance1',
  status: 'pending',
  createdAt: new Date().toISOString(),
  ...overrides,
});

const t = (offsetMs = 0) => new Date(1_000_000 + offsetMs).toISOString();

describe('buildRequesterGroups — grouping key', () => {
  test('groups requests by clientId when present', () => {
    const requests = [
      makeReq({ clientId: 'client1', danceName: 'Waterfall' }),
      makeReq({ clientId: 'client1', danceName: 'Electric Slide' }),
    ];
    const groups = buildRequesterGroups(requests, {});
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('client1');
    expect(groups[0].requests).toHaveLength(2);
  });

  test('groups by requesterName when clientId is missing', () => {
    const requests = [
      makeReq({ clientId: null, requesterName: 'Pat' }),
      makeReq({ clientId: null, requesterName: 'Pat' }),
    ];
    const groups = buildRequesterGroups(requests, {});
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('Pat');
  });

  test('falls back to "anon" when both clientId and requesterName are missing', () => {
    const requests = [
      makeReq({ clientId: null, requesterName: null }),
      makeReq({ clientId: null, requesterName: null }),
    ];
    const groups = buildRequesterGroups(requests, {});
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('anon');
  });

  test('different clientIds produce separate groups', () => {
    const requests = [
      makeReq({ clientId: 'client1' }),
      makeReq({ clientId: 'client2' }),
    ];
    const groups = buildRequesterGroups(requests, {});
    expect(groups).toHaveLength(2);
  });
});

describe('buildRequesterGroups — displayName resolution', () => {
  test('uses resolvedNames[clientId] when available', () => {
    const requests = [makeReq({ clientId: 'client1', requesterName: 'client1' })];
    const groups = buildRequesterGroups(requests, { client1: 'Pat' });
    expect(groups[0].displayName).toBe('Pat');
  });

  test('falls back to requesterName when not in resolvedNames', () => {
    const requests = [makeReq({ clientId: 'client1', requesterName: 'Pat' })];
    const groups = buildRequesterGroups(requests, {});
    expect(groups[0].displayName).toBe('Pat');
  });

  test('falls back to clientId when requesterName is missing', () => {
    const requests = [makeReq({ clientId: 'client1', requesterName: null })];
    const groups = buildRequesterGroups(requests, {});
    expect(groups[0].displayName).toBe('client1');
  });

  test('falls back to "Anonymous" when nothing is available', () => {
    const requests = [makeReq({ clientId: null, requesterName: null })];
    const groups = buildRequesterGroups(requests, {});
    expect(groups[0].displayName).toBe('Anonymous');
  });
});

describe('buildRequesterGroups — counts and sorting', () => {
  test('submitted counts all requests in the group', () => {
    const requests = [
      makeReq({ clientId: 'client1', status: 'pending' }),
      makeReq({ clientId: 'client1', status: 'played' }),
      makeReq({ clientId: 'client1', status: 'skipped' }),
    ];
    const groups = buildRequesterGroups(requests, {});
    expect(groups[0].submitted).toBe(3);
  });

  test('fulfilled counts only played requests', () => {
    const requests = [
      makeReq({ clientId: 'client1', status: 'pending' }),
      makeReq({ clientId: 'client1', status: 'played' }),
      makeReq({ clientId: 'client1', status: 'played' }),
    ];
    const groups = buildRequesterGroups(requests, {});
    expect(groups[0].fulfilled).toBe(2);
  });

  test('requests within a group are sorted by createdAt descending', () => {
    const requests = [
      makeReq({ clientId: 'client1', danceName: 'Older', createdAt: t(100) }),
      makeReq({ clientId: 'client1', danceName: 'Newer', createdAt: t(500) }),
    ];
    const groups = buildRequesterGroups(requests, {});
    expect(groups[0].requests[0].danceName).toBe('Newer');
    expect(groups[0].requests[1].danceName).toBe('Older');
  });

  test('groups are sorted by descending submitted count', () => {
    const requests = [
      makeReq({ clientId: 'client1' }),
      makeReq({ clientId: 'client2' }),
      makeReq({ clientId: 'client2' }),
      makeReq({ clientId: 'client2' }),
    ];
    const groups = buildRequesterGroups(requests, {});
    expect(groups[0].key).toBe('client2');
    expect(groups[0].submitted).toBe(3);
    expect(groups[1].key).toBe('client1');
  });
});
