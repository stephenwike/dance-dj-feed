import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';
import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';

const BEAT_VALUE_CENTS = 5;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== 'true') return res.status(503).json({ error: 'Payments not enabled' });

  const session = await getServerSession(req, res, authOptions);
  const djId = session?.user?.id ?? null;
  if (!djId) return res.status(401).json({ error: 'Unauthorized' });

  const { recipientEmail, beats, message } = req.body ?? {};
  if (!recipientEmail || !Number.isInteger(beats) || beats < 1) {
    return res.status(400).json({ error: 'recipientEmail and a positive integer beats are required' });
  }

  const client = await clientPromise;
  const db = client.db(DB_NAME);

  // Look up recipient
  const recipient = await db.collection('user_profiles').findOne(
    { email: { $regex: `^${recipientEmail.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
    { projection: { id: 1, name: 1 } }
  );
  if (!recipient) return res.status(404).json({ error: 'No registered user found with that email' });
  if (recipient.id === djId) return res.status(400).json({ error: 'Cannot gift beats to yourself' });

  // Verify DJ wallet balance
  const txns = await db.collection('dj_wallet_transactions').find({ ownerId: djId }).toArray();
  const balance = txns.reduce((sum, t) => sum + (t.amountCents ?? 0), 0);
  const costCents = beats * BEAT_VALUE_CENTS;

  if (balance < costCents) {
    return res.status(400).json({
      error: `Insufficient balance. Gifting ${beats} beats costs $${(costCents / 100).toFixed(2)}, your balance is $${(balance / 100).toFixed(2)}.`,
    });
  }

  // Look up DJ's registered name for the notification
  const djProfile = await db.collection('user_profiles').findOne(
    { id: djId },
    { projection: { name: 1 } }
  );
  const djName = djProfile?.name || 'The DJ';
  const giftMessage = message?.trim() || null;

  const now = new Date();

  await Promise.all([
    // Debit DJ wallet
    db.collection('dj_wallet_transactions').insertOne({
      ownerId: djId,
      type: 'beat_gift',
      amountCents: -costCents,
      recipientId: recipient.id,
      recipientEmail: recipientEmail.trim().toLowerCase(),
      beats,
      createdAt: now,
    }),
    // Credit recipient beat balance
    db.collection('beat_balances').updateOne(
      { attendeeId: recipient.id },
      { $inc: { beats }, $set: { updatedAt: now } },
      { upsert: true }
    ),
    // Log beat transaction for recipient
    db.collection('beat_transactions').insertOne({
      attendeeId: recipient.id,
      type: 'gift',
      beats,
      fromDjId: djId,
      createdAt: now,
    }),
    // Notify recipient
    db.collection('attendee_notifications').insertOne({
      recipientId: recipient.id,
      type: 'beat_gift',
      fromDjId: djId,
      fromName: djName,
      beats,
      message: giftMessage,
      read: false,
      createdAt: now,
    }),
  ]);

  return res.status(200).json({
    ok: true,
    recipientName: recipient.name,
    beats,
    costCents,
    newDjBalance: balance - costCents,
  });
}
