import clientPromise from '../../../lib/server/mongodb';
import { getAuth } from '@clerk/nextjs/server';

function defaultSessionName() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

/** URL-safe slug from a session name + timestamp, e.g. "friday-night-may-9-1715" */
function makeSlug(name) {
  const datePart = new Date()
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toLowerCase().replace(/\s+/g, '-');
  const namePart = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 30);
  return `${namePart}-${datePart}`;
}

export default async function handler(req, res) {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  const col = client.db('bld').collection('dj_sessions');

  if (req.method === 'GET') {
    const sessions = await col.find({ ownerId: userId }).sort({ startedAt: -1 }).toArray();
    return res.status(200).json(sessions.map(s => ({ ...s, _id: String(s._id) })));
  }

  if (req.method === 'POST') {
    await col.updateMany(
      { status: 'active', ownerId: userId },
      { $set: { status: 'closed', closedAt: new Date() } }
    );
    const name = req.body?.name || defaultSessionName();
    const plugin = req.body?.plugin ?? 'standard';
    const durationMinutes = Number(req.body?.durationMinutes) || 120;
    const now = new Date();
    const doc = {
      ownerId: userId,
      name,
      slug: makeSlug(name),
      status: 'active',
      plugin,
      startedAt: now,
      endsAt: new Date(now.getTime() + durationMinutes * 60 * 1000),
      closedAt: null,
      partnerDancesEnabled: true,
      weightDecayEnabled: false,
      weightDecayHalfLifeMinutes: 60,
      tippingEnabled: true,
    };
    const result = await col.insertOne(doc);
    return res.status(201).json({ ...doc, _id: String(result.insertedId) });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
