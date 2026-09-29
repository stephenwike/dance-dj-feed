'use strict';
const { danceKey, sortedQueue, nextInQueue, isActive } = require('../lib/client/dj/queue');

describe('danceKey', () => {
  test('line dances key by normalised name, regardless of danceId', () => {
    expect(danceKey({ danceName: '  Electric Slide ', danceId: 'd1' })).toBe('electric slide');
    expect(danceKey({ danceName: 'ELECTRIC SLIDE' })).toBe('electric slide');
  });

  test('an original partner dance keys by its own _id', () => {
    expect(danceKey({ _id: 'p1', danceType: 'partner', danceName: 'Partner Dance' })).toBe('p1');
  });

  test('a partner upvote keys by the original it points at', () => {
    expect(danceKey({ _id: 'p2', danceType: 'partner', partnerGroupId: 'p1' })).toBe('p1');
  });

  test('handles a missing name', () => {
    expect(danceKey({})).toBe('');
  });
});

describe('sortedQueue / nextInQueue', () => {
  const requests = [
    { _id: 'a', status: 'approved', queuePosition: 3 },
    { _id: 'b', status: 'pending', queuePosition: 1 },
    { _id: 'c', status: 'approved', queuePosition: 2 },
    { _id: 'd', status: 'playing', queuePosition: 0 },
  ];

  test('returns only approved requests in queue order', () => {
    expect(sortedQueue(requests).map(r => r._id)).toEqual(['c', 'a']);
  });

  test('nextInQueue is the first approved request', () => {
    expect(nextInQueue(requests)._id).toBe('c');
  });

  test('nextInQueue is null for an empty queue', () => {
    expect(nextInQueue([{ status: 'pending' }])).toBeNull();
  });
});

describe('isActive', () => {
  test.each([
    ['pending', true], ['approved', true], ['playing', true],
    ['played', false], ['skipped', false],
  ])('%s → %p', (status, expected) => {
    expect(isActive({ status })).toBe(expected);
  });
});
