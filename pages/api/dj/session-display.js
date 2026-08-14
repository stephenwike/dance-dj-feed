import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';
import { ObjectId } from 'mongodb';

// Public endpoint — no auth. Used by feed-preview to get the session's current
// template and aspect ratio so the TV display auto-updates when the DJ changes
// the template in the controller. The sessionId acts as the capability token.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  try {
    const client = await clientPromise;
    const col = client.db(DB_NAME).collection('dj_sessions');
    const doc = await col.findOne(
      { _id: new ObjectId(sessionId) },
      { projection: { feedTemplateId: 1, feedAspectRatio: 1, feedAppliedAt: 1, status: 1 } },
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      feedTemplateId:  doc.feedTemplateId  ?? 'default',
      feedAspectRatio: doc.feedAspectRatio ?? '16:9',
      feedAppliedAt:   doc.feedAppliedAt   ?? null,
      status:          doc.status,
    });
  } catch {
    return res.status(400).json({ error: 'Invalid session ID' });
  }
}
