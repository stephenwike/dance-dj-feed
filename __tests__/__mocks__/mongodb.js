'use strict';
// Controllable MongoDB stub. Tests set `__state` before each request.
const state = {
  activeSession: { _id: 'session1', status: 'active' },
  requests: [],      // existing dj_requests documents
  insertedDoc: null, // captured by insertOne
};

function makeCollection(docs) {
  return {
    findOne: jest.fn(async (filter) => {
      // Simple matcher: check every key in the filter
      return docs.find(doc => Object.entries(filter).every(([k, v]) => {
        if (k === '_id') return String(doc._id) === String(v?.$in?.[0] ?? v);
        if (v && typeof v === 'object' && '$in' in v) return v.$in.includes(doc[k]);
        if (v && typeof v === 'object' && '$regex' in v) return v.$regex.test(doc[k]);
        return doc[k] === v;
      })) ?? null;
    }),
    find: jest.fn((filter) => ({
      sort: jest.fn().mockReturnThis(),
      project: jest.fn().mockReturnThis(),
      toArray: jest.fn(async () =>
        docs.filter(doc => Object.entries(filter).every(([k, v]) => {
          if (v && typeof v === 'object' && '$in' in v) return v.$in.includes(doc[k]);
          if (v && typeof v === 'object' && '$regex' in v) return v.$regex.test(doc[k]);
          return doc[k] === v;
        }))
      ),
    })),
    insertOne: jest.fn(async (doc) => {
      state.insertedDoc = doc;
      return { insertedId: 'new-id-123' };
    }),
  };
}

const mockClient = {
  db: jest.fn((name) => ({
    collection: jest.fn((col) => {
      if (name === 'bld' && col === 'dj_sessions') return makeCollection([state.activeSession].filter(Boolean));
      if (name === 'bld' && col === 'dj_requests') return makeCollection(state.requests);
      if (name === 'ldco' && col === 'dances') return makeCollection([]);
      if (name === 'ldco' && col === 'tracks') return makeCollection([]);
      return makeCollection([]);
    }),
  })),
};

module.exports = {
  __esModule: true,
  default: Promise.resolve(mockClient),
  __state: state,
  __resetState: () => {
    state.activeSession = { _id: 'session1', status: 'active' };
    state.requests = [];
    state.insertedDoc = null;
    jest.clearAllMocks();
  },
};
