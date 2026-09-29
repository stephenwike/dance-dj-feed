import clientPromise, { DB_NAME } from '../../../../lib/server/mongodb';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../lib/server/authOptions';
import { getSessionTimeState } from '../../../../lib/dj/sessionTimeState';
import { normalizeSession } from '../../../../lib/server/dj/reportLogic';
import { makeSlug } from '../../../../lib/server/dj/sessionLogic';
import { toObjectId, exactCaseInsensitive } from '../../../../lib/server/db';
import { SESSION_PLUGINS } from '../../../../lib/dj/sessionPricing';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  const col = client.db(DB_NAME).collection('dj_sessions');
  const { id } = req.query;

  const objId = toObjectId(id);
  if (!objId) return res.status(400).json({ error: 'Invalid id' });

  if (req.method === 'GET') {
    const session = await col.findOne({ _id: objId, ownerId: userId });
    if (!session) return res.status(404).json({ error: 'Not found' });

    const report = await client.db(DB_NAME).collection('session_reports')
      .findOne({ sessionId: String(objId) });
    if (report) {
      return res.status(200).json({ ...session, _id: String(session._id), report });
    }

    const played = await client.db(DB_NAME).collection('dj_requests')
      .find({ sessionId: String(objId), status: 'played' })
      .sort({ updatedAt: 1 })
      .toArray();
    const out = { ...session, _id: String(session._id), played: played.map(r => ({ ...r, _id: String(r._id) })) };
    if (session.status === 'active') {
      out.timeState = getSessionTimeState(session).state;
    }
    return res.status(200).json(out);
  }

  if (req.method === 'PATCH') {
    const { status, name, durationMinutes, partnerDancesEnabled, tippingEnabled, requestsEnabled, weightDecayEnabled, weightDecayHalfLifeMinutes, fairnessScoringEnabled, queueVisibleToRequesters, queueVisibleCount, feedAspectRatio, feedTemplateId, feedAppliedAt, plugin } = req.body ?? {};
    const set = {};

    if (plugin !== undefined) {
      if (!SESSION_PLUGINS.includes(plugin)) return res.status(400).json({ error: 'Invalid plugin' });
      set.plugin = plugin;
    }

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return res.status(400).json({ error: 'Name cannot be empty' });
      const collision = await col.findOne({
        ownerId: userId,
        _id: { $ne: objId },
        status: { $in: ['draft', 'active'] },
        name: exactCaseInsensitive(trimmed),
      });
      if (collision) return res.status(409).json({ error: `A session named "${trimmed}" already exists` });
      set.name = trimmed;
      set.slug = makeSlug(trimmed);
    }

    // Only the filter below matters for writes, but status transitions depend
    // on the current state, so load it first.
    const current = await col.findOne({ _id: objId, ownerId: userId }, { projection: { status: 1, startedAt: 1 } });
    if (!current) return res.status(404).json({ error: 'Not found' });

    if (status === 'closed') {
      set.status = 'closed';
      set.closedAt = new Date();
      set.suppressedClientIds = [];
    } else if (status === 'active') {
      // "Continue" re-opens a session that already ran (and was paid for).
      // Drafts must go through checkout / wallet-pay, which set endsAt;
      // activating one here would create a session with no end time.
      if (current.status !== 'closed' || !current.startedAt) {
        return res.status(409).json({ error: 'Only a previously started session can be continued' });
      }
      set.status = 'active';
      set.closedAt = null;
    }

    if (durationMinutes !== undefined) set.durationMinutes = Number(durationMinutes) || null;
    if (partnerDancesEnabled !== undefined) set.partnerDancesEnabled = !!partnerDancesEnabled;
    if (tippingEnabled !== undefined) set.tippingEnabled = !!tippingEnabled;
    if (requestsEnabled !== undefined) set.requestsEnabled = !!requestsEnabled;
    if (weightDecayEnabled !== undefined) set.weightDecayEnabled = !!weightDecayEnabled;
    if (weightDecayHalfLifeMinutes !== undefined) set.weightDecayHalfLifeMinutes = Number(weightDecayHalfLifeMinutes) || 60;
    if (fairnessScoringEnabled !== undefined) set.fairnessScoringEnabled = !!fairnessScoringEnabled;
    if (queueVisibleToRequesters !== undefined) set.queueVisibleToRequesters = !!queueVisibleToRequesters;
    if (queueVisibleCount !== undefined) set.queueVisibleCount = Math.max(0, Number(queueVisibleCount) || 0);
    if (feedAspectRatio !== undefined) set.feedAspectRatio = String(feedAspectRatio);
    if (feedTemplateId !== undefined) set.feedTemplateId = String(feedTemplateId);
    if (feedAppliedAt !== undefined) set.feedAppliedAt = String(feedAppliedAt);
    await col.updateOne({ _id: objId, ownerId: userId }, { $set: set });

    if (status === 'closed') {
      normalizeSession(client, String(objId)).catch(err =>
        console.error('Report normalization failed:', err)
      );
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
