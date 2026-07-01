import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';
import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

function isAdmin(email) {
  return ADMIN_EMAILS.includes((email || '').toLowerCase());
}

export default async function handler(req, res) {
  const authSession = await getServerSession(req, res, authOptions);
  if (!authSession?.user?.email || !isAdmin(authSession.user.email)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const client = await clientPromise;
  const col = client.db(DB_NAME).collection('free_access');

  if (req.method === 'GET') {
    const entries = await col.find({}).sort({ createdAt: -1 }).toArray();
    return res.status(200).json(entries.map(e => ({ ...e, _id: String(e._id) })));
  }

  if (req.method === 'POST') {
    const { email, expiresAt, note } = req.body ?? {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'email is required' });
    }
    const normalized = email.trim().toLowerCase();
    const existing = await col.findOne({ email: normalized });
    if (existing) return res.status(409).json({ error: 'Email already in free-access list' });

    const doc = {
      email: normalized,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      note: note || null,
      createdAt: new Date(),
    };
    const result = await col.insertOne(doc);
    return res.status(201).json({ ...doc, _id: String(result.insertedId) });
  }

  if (req.method === 'DELETE') {
    const { email } = req.body ?? {};
    if (!email) return res.status(400).json({ error: 'email is required' });
    const result = await col.deleteOne({ email: email.trim().toLowerCase() });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json({ deleted: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
