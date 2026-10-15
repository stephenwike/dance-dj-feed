'use strict';
/**
 * "Link past dancers": link dancers to a host from the host's past events,
 * for events before links were recorded live (lib/server/ldco/hostDancers.js).
 *
 * A past event remembers its requesters in `requester_history` (written when
 * the event closed, see reportLogic.generateRequesterHistory): one document
 * per requester per event, keyed by `clientId`. For a signed-in dancer that
 * clientId is their account id; guests only have a random device id
 * ("anon_…"), so they can't be linked. An account is recognised by its
 * `ldco.users` entry, which also gives the name and email to show the host.
 *
 * Page visits weren't recorded before live links, so only dancers who made a
 * request can be found. Hosts can only link from their own events.
 */
const { DB_NAME, toObjectId } = require('../db');
const { ATTENDANCE, HOST_DANCERS, backfillAttendance } = require('../ldco/hostDancers');
const { findAccountsByIds } = require('../ldco/users');

const LDCO_DB = 'ldco';
const SYSTEM_CLIENTS = new Set(['dj', 'spotify']);

function isPossibleAccount(clientId) {
  return !!clientId && !SYSTEM_CLIENTS.has(clientId) && !String(clientId).startsWith('anon_');
}

/** When the dancer was there: their first request, else the event's start. */
function seenAt(history) {
  const times = (history.requests ?? []).map(r => new Date(r.createdAt).getTime()).filter(Number.isFinite);
  return times.length ? new Date(Math.min(...times)) : new Date(history.sessionDate);
}

/** The host's own closed events that remember any requesters, newest first. */
async function ownSessions(client, hostId, sessionIds) {
  const filter = { ownerId: hostId, status: 'closed', startedAt: { $ne: null } };
  if (sessionIds) filter._id = { $in: sessionIds.map(id => toObjectId(String(id))).filter(Boolean) };
  return client.db(DB_NAME).collection('dj_sessions')
    .find(filter, { projection: { name: 1, startedAt: 1 } })
    .sort({ startedAt: -1 })
    .toArray();
}

/** { userId → { name, email } } for ids that are real accounts. */
async function accountsFor(client, ids) {
  if (!ids.length) return {};
  const accounts = await findAccountsByIds(client, ids);
  return Object.fromEntries(accounts.map(a => [a.id, { name: a.name, email: a.email }]));
}

/**
 * The host's past events, for choosing: newest first, each with how many
 * signed-in dancers and guests requested there and how many are linked.
 * [{ id, name, date, dancers, guests, linked }]
 */
async function listLinkableSessions(client, hostId) {
  const sessions = await ownSessions(client, hostId);
  if (!sessions.length) return [];
  const ids = sessions.map(s => String(s._id));
  const history = await client.db(DB_NAME).collection('requester_history')
    .find({ sessionId: { $in: ids }, ownerId: hostId }, { projection: { sessionId: 1, clientId: 1 } })
    .toArray();
  const accounts = await accountsFor(client, [...new Set(history.map(h => h.clientId).filter(isPossibleAccount))]);
  const linkedRows = await client.db(LDCO_DB).collection(ATTENDANCE)
    .find({ hostId, sessionId: { $in: ids } }, { projection: { sessionId: 1 } })
    .toArray();

  return sessions.map(s => {
    const id = String(s._id);
    const here = history.filter(h => h.sessionId === id && !SYSTEM_CLIENTS.has(h.clientId) && h.clientId !== hostId);
    const dancers = here.filter(h => accounts[h.clientId]).length;
    return {
      id,
      name: s.name,
      date: s.startedAt,
      dancers,
      guests: here.length - dancers,
      linked: linkedRows.filter(r => r.sessionId === id).length,
    };
  });
}

/**
 * The signed-in dancers who requested at the chosen events (the host's own).
 * { dancers: [{ userId, name, email, sessions: [{ id, name, date }], linked }], guests }
 * `linked`: already linked to this host (linking again adds these events).
 */
async function previewDancers(client, hostId, sessionIds) {
  const sessions = await ownSessions(client, hostId, sessionIds);
  const ids = sessions.map(s => String(s._id));
  if (!ids.length) return { dancers: [], guests: 0 };
  const byId = Object.fromEntries(sessions.map(s => [String(s._id), s]));

  const history = await client.db(DB_NAME).collection('requester_history')
    .find({ sessionId: { $in: ids }, ownerId: hostId })
    .toArray();
  const people = history.filter(h => !SYSTEM_CLIENTS.has(h.clientId) && h.clientId !== hostId); // not yourself
  const accounts = await accountsFor(client, [...new Set(people.map(h => h.clientId).filter(isPossibleAccount))]);
  const linked = new Set((await client.db(LDCO_DB).collection(HOST_DANCERS)
    .find({ hostId, userId: { $in: Object.keys(accounts) } }, { projection: { userId: 1 } })
    .toArray()).map(l => l.userId));

  const dancers = new Map();
  let guests = 0;
  for (const h of people) {
    const account = accounts[h.clientId];
    if (!account) { guests += 1; continue; }
    if (!dancers.has(h.clientId)) {
      dancers.set(h.clientId, {
        userId: h.clientId,
        name: account.name || h.requesterName || '',
        email: account.email,
        sessions: [],
        linked: linked.has(h.clientId),
      });
    }
    const s = byId[h.sessionId];
    dancers.get(h.clientId).sessions.push({ id: h.sessionId, name: s.name, date: s.startedAt });
  }

  const list = [...dancers.values()]
    .map(d => ({ ...d, sessions: d.sessions.sort((a, b) => new Date(b.date) - new Date(a.date)) }))
    .sort((a, b) => b.sessions.length - a.sessions.length || (a.name || a.email).localeCompare(b.name || b.email));
  return { dancers: list, guests };
}

/**
 * Link the chosen dancers to the host from the chosen events (the host's
 * own). Only dancers who requested at an event are linked from it.
 * → { dancers, newLinks, events }
 */
async function linkDancers(client, hostId, { sessionIds, userIds }) {
  const sessions = await ownSessions(client, hostId, sessionIds);
  const ids = sessions.map(s => String(s._id));
  const wanted = new Set((userIds ?? []).map(String));
  if (!ids.length || !wanted.size) return { dancers: 0, newLinks: 0, events: 0 };

  const history = await client.db(DB_NAME).collection('requester_history')
    .find({ sessionId: { $in: ids }, ownerId: hostId, clientId: { $in: [...wanted] } })
    .toArray();
  const accounts = await accountsFor(client, [...new Set(history.map(h => h.clientId))]);

  const linkedDancers = new Set();
  const newLinks = new Set();
  const events = new Set();
  for (const h of history) {
    if (!accounts[h.clientId] || h.clientId === hostId) continue;
    const result = await backfillAttendance(client, { hostId, sessionId: h.sessionId, userId: h.clientId, seenAt: seenAt(h) });
    linkedDancers.add(h.clientId);
    events.add(h.sessionId);
    if (result.newLink) newLinks.add(h.clientId);
  }
  return { dancers: linkedDancers.size, newLinks: newLinks.size, events: events.size };
}

module.exports = { listLinkableSessions, previewDancers, linkDancers, isPossibleAccount, seenAt };
