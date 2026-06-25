import clientPromise, { DB_NAME } from '../../../../lib/server/mongodb';
import { ObjectId } from 'mongodb';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../lib/server/authOptions';

export default async function handler(req, res) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;
  let objId;
  try { objId = new ObjectId(id); } catch { return res.status(400).json({ error: 'Invalid id' }); }

  const client = await clientPromise;
  await client.db(DB_NAME).collection('dj_messages').updateOne(
    { _id: objId, ownerId: userId },
    { $set: { status: 'dismissed', updatedAt: new Date() } }
  );

  return res.status(200).json({ ok: true });
}
