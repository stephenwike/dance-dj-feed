import clientPromise from '../../../../lib/server/mongodb';
import { getSharedReport } from '../../../../lib/server/dj/shareLogic';

/** Public: the report behind a share link (used by its cover image). */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const report = await getSharedReport(await clientPromise, req.query.token);
  if (!report) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  return res.status(200).json(report);
}
