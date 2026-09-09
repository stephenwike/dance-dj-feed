import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';
import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  const db = client.db(DB_NAME);

  // Attendee IDs who have tipped this DJ's requests
  const beatTips = await db.collection('beat_transactions')
    .find({ djId: userId, type: 'tip' }, { projection: { attendeeId: 1 } })
    .toArray();
  const attendeeIds = [...new Set(beatTips.map(t => t.attendeeId).filter(Boolean))];

  // Emails who have sent direct tips to this DJ (may or may not be registered users)
  const directTips = await db.collection('dj_wallet_transactions')
    .find({ ownerId: userId, type: 'direct_tip', senderEmail: { $ne: null } }, { projection: { senderEmail: 1 } })
    .toArray();
  const senderEmails = [...new Set(directTips.map(t => t.senderEmail).filter(Boolean).map(e => e.toLowerCase()))];

  // Look up user_profiles matching either set
  const query = [];
  if (attendeeIds.length) query.push({ id: { $in: attendeeIds } });
  if (senderEmails.length) query.push({ email: { $in: senderEmails } });
  if (!query.length) return res.status(200).json({ attendees: [] });

  const profiles = await db.collection('user_profiles')
    .find({ $or: query }, { projection: { id: 1, name: 1, email: 1 } })
    .toArray();

  // Deduplicate by id, exclude the DJ themselves
  const seen = new Set();
  const attendees = [];
  for (const p of profiles) {
    if (p.id === userId || seen.has(p.id)) continue;
    seen.add(p.id);
    attendees.push({ id: p.id, name: p.name, email: p.email });
  }

  attendees.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

  return res.status(200).json({ attendees });
}
