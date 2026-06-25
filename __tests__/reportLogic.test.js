'use strict';
const { generateSessionReport, generateRequesterHistory, cleanupSessionRequests, normalizeSession } = require('../lib/server/dj/reportLogic');

function mockClient(sessions, requests) {
  const collections = {
    dj_sessions: {
      findOne: ({ _id }) => Promise.resolve(sessions.find(s => String(s._id) === String(_id)) || null),
    },
    dj_requests: {
      find: (filter) => {
        const filtered = requests.filter(r => {
          if (filter.sessionId && r.sessionId !== filter.sessionId) return false;
          if (filter.danceType?.$ne && r.danceType === filter.danceType.$ne) return false;
          if (filter.clientId?.$nin && filter.clientId.$nin.includes(r.clientId)) return false;
          return true;
        });
        const chain = {
          sort: () => chain,
          toArray: () => Promise.resolve(filtered),
        };
        return chain;
      },
      deleteMany: (filter) => Promise.resolve({ deletedCount: requests.filter(r => r.sessionId === filter.sessionId).length }),
    },
    session_reports: {
      findOne: () => Promise.resolve(null),
      updateOne: jest.fn().mockResolvedValue({}),
    },
    requester_history: {
      updateOne: jest.fn().mockResolvedValue({}),
    },
  };
  return { db: () => ({ collection: (name) => collections[name] }) };
}

const SESSION_ID = '507f1f77bcf86cd799439011';
const SESSION = {
  _id: SESSION_ID,
  ownerId: 'user1',
  name: 'Friday Night',
  startedAt: new Date('2026-01-01T20:00:00Z'),
  endsAt: new Date('2026-01-01T22:00:00Z'),
  closedAt: new Date('2026-01-01T22:05:00Z'),
  extensions: [],
};

const REQUESTS = [
  { _id: '1', sessionId: SESSION_ID, clientId: 'c1', requesterName: 'Alice', danceName: 'Cupid Shuffle', danceId: 'd1', songName: 'Cupid Shuffle', artist: 'Cupid', difficulty: 'Beginner', status: 'played', tipCents: 25, danceType: null, updatedAt: new Date('2026-01-01T20:10:00Z'), createdAt: new Date() },
  { _id: '2', sessionId: SESSION_ID, clientId: 'c2', requesterName: 'Bob', danceName: 'Cupid Shuffle', danceId: 'd1', songName: 'Cupid Shuffle', artist: 'Cupid', difficulty: 'Beginner', status: 'played', tipCents: 50, danceType: null, updatedAt: new Date('2026-01-01T20:10:00Z'), createdAt: new Date() },
  { _id: '3', sessionId: SESSION_ID, clientId: 'c1', requesterName: 'Alice', danceName: 'Electric Slide', danceId: 'd2', songName: 'Electric Boogie', artist: 'Marcia', difficulty: 'Beginner', status: 'skipped', tipCents: 0, danceType: null, updatedAt: new Date('2026-01-01T20:20:00Z'), createdAt: new Date() },
  { _id: '4', sessionId: SESSION_ID, clientId: 'dj', requesterName: 'DJ', danceName: 'Break', danceType: 'message', status: 'played', tipCents: 0, updatedAt: new Date(), createdAt: new Date() },
];

describe('generateSessionReport', () => {
  test('creates report with correct shape and stats', async () => {
    const client = mockClient([SESSION], REQUESTS);
    const report = await generateSessionReport(client, SESSION_ID);

    expect(report.sessionId).toBe(SESSION_ID);
    expect(report.sessionName).toBe('Friday Night');
    expect(report.playedTracks).toHaveLength(1);
    expect(report.playedTracks[0].danceName).toBe('Cupid Shuffle');
    expect(report.playedTracks[0].requesterCount).toBe(2);
    expect(report.playedTracks[0].totalTips).toBe(75);
    expect(report.stats.totalDancesPlayed).toBe(1);
    expect(report.stats.totalRequests).toBe(3);
    expect(report.stats.totalSkipped).toBe(1);
    expect(report.stats.uniqueRequesters).toBe(2);
    expect(report.stats.totalTipCents).toBe(75);
  });

  test('excludes message-type requests from played tracks', async () => {
    const client = mockClient([SESSION], REQUESTS);
    const report = await generateSessionReport(client, SESSION_ID);
    const trackNames = report.playedTracks.map(t => t.danceName);
    expect(trackNames).not.toContain('Break');
  });
});

describe('generateRequesterHistory', () => {
  test('creates per-attendee history excluding system clients', async () => {
    const client = mockClient([SESSION], REQUESTS);
    await generateRequesterHistory(client, SESSION_ID);
    const col = client.db().collection('requester_history');
    expect(col.updateOne).toHaveBeenCalledTimes(2);
  });
});

describe('cleanupSessionRequests', () => {
  test('deletes all requests for the session', async () => {
    const client = mockClient([SESSION], REQUESTS);
    const result = await cleanupSessionRequests(client, SESSION_ID);
    expect(result.deletedCount).toBe(4);
  });
});
