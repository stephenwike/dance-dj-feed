import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';
import { ObjectId } from 'mongodb';
import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';

const BEAT_VALUE_CENTS = 5;  // 1 beat = $0.05
const DJ_CUT = 0.9;          // DJ receives 90% of tip value

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== 'true') return res.status(503).json({ error: 'Payments not yet enabled' });

  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { requestId, beats } = req.body ?? {};

  if (!requestId || !Number.isInteger(beats) || beats < 1) {
    return res.status(400).json({ error: 'requestId and a positive integer beats are required' });
  }

  let requestObjId;
  try { requestObjId = new ObjectId(requestId); } catch {
    return res.status(400).json({ error: 'Invalid requestId' });
  }

  const client = await clientPromise;
  const db = client.db(DB_NAME);

  const request = await db.collection('dj_requests').findOne({ _id: requestObjId });
  if (!request) return res.status(404).json({ error: 'Request not found' });

  // Atomically deduct beats — fails cleanly if balance is insufficient
  const updated = await db.collection('beat_balances').findOneAndUpdate(
    { attendeeId: userId, beats: { $gte: beats } },
    { $inc: { beats: -beats }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  if (!updated) return res.status(400).json({ error: 'Insufficient balance' });

  const tipCentsAdd = beats * BEAT_VALUE_CENTS;
  const djCreditCents = Math.round(tipCentsAdd * DJ_CUT);
  const now = new Date();

  await db.collection('dj_requests').updateOne(
    { _id: requestObjId },
    { $inc: { tipCents: tipCentsAdd }, $set: { updatedAt: now } }
  );

  await Promise.all([
    db.collection('beat_transactions').insertOne({
      attendeeId: userId,
      type: 'tip',
      beats: -beats,
      requestId: String(requestId),
      djId: request.ownerId ?? null,
      createdAt: now,
    }),
    db.collection('dj_wallet_transactions').insertOne({
      ownerId: request.ownerId ?? null,
      type: 'beat_tip',
      amountCents: djCreditCents,
      requestId: String(requestId),
      attendeeId: userId,
      createdAt: now,
    }),
  ]);

  return res.status(200).json({ beats: updated.beats });
}

