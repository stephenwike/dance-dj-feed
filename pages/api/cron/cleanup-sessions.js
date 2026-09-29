import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';
import { getSessionTimeState } from '../../../lib/dj/sessionTimeState';
import { normalizeSession } from '../../../lib/server/dj/reportLogic';
import { closeSession } from '../../../lib/server/dj/sessionLogic';

export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = await clientPromise;
  const col = client.db(DB_NAME).collection('dj_sessions');
  const active = await col.find({ status: 'active' }).toArray();
  const now = new Date();

  let closed = 0;
  for (const s of active) {
    if (getSessionTimeState(s, now).state === 'expired') {
      await closeSession(client, s._id, { auto: true, now });
      await normalizeSession(client, String(s._id)).catch(err =>
        console.error('Cron normalization failed:', err)
      );
      closed++;
    }
  }

  return res.status(200).json({ checked: active.length, closed });
}
