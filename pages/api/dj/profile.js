import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';
import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  const profiles = client.db(DB_NAME).collection('dj_profiles');

  if (req.method === 'GET') {
    const profile = await profiles.findOne({ ownerId: userId });
    return res.status(200).json({ paymentLinks: profile?.paymentLinks ?? [] });
  }

  if (req.method === 'PATCH') {
    const { paymentLinks } = req.body ?? {};
    if (!Array.isArray(paymentLinks)) return res.status(400).json({ error: 'paymentLinks must be an array' });
    if (paymentLinks.length > 3) return res.status(400).json({ error: 'Maximum 3 payment links' });

    for (const link of paymentLinks) {
      if (!link.label?.trim()) return res.status(400).json({ error: 'Each link needs a label' });
      if (!link.url?.trim()) return res.status(400).json({ error: 'Each link needs a url' });
      try { new URL(link.url.trim()); } catch { return res.status(400).json({ error: `Invalid URL: ${link.url}` }); }
    }

    const cleaned = paymentLinks.map(l => ({ label: l.label.trim(), url: l.url.trim() }));
    await profiles.updateOne({ ownerId: userId }, { $set: { paymentLinks: cleaned } }, { upsert: true });
    return res.status(200).json({ paymentLinks: cleaned });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
