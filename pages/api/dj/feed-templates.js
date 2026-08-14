import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  const profiles = client.db(DB_NAME).collection('dj_profiles');

  if (req.method === 'GET') {
    const profile = await profiles.findOne({ ownerId: userId }, { projection: { feedTemplates: 1 } });
    return res.status(200).json(profile?.feedTemplates ?? []);
  }

  if (req.method === 'POST') {
    const { name, designedFor, slides } = req.body ?? {};
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const template = {
      id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      designedFor: designedFor ?? '16:9',
      slides: Array.isArray(slides) ? slides : [],
      createdAt: new Date().toISOString(),
    };
    await profiles.updateOne(
      { ownerId: userId },
      { $push: { feedTemplates: template } },
      { upsert: true }
    );
    return res.status(201).json(template);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
