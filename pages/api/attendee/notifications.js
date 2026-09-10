import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  const col = client.db(DB_NAME).collection('attendee_notifications');

  if (req.method === 'GET') {
    const notifications = await col
      .find({ recipientId: userId })
      .sort({ createdAt: -1 })
      .limit(30)
      .toArray();
    const unreadCount = notifications.filter(n => !n.read).length;
    return res.status(200).json({
      notifications: notifications.map(n => ({ ...n, _id: String(n._id) })),
      unreadCount,
    });
  }

  if (req.method === 'PATCH') {
    const { id } = req.body ?? {};
    if (!id) return res.status(400).json({ error: 'id is required' });
    await col.updateOne(
      { _id: new ObjectId(id), recipientId: userId },
      { $set: { read: true } }
    );
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
