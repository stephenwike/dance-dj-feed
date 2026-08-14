import clientPromise, { DB_NAME } from '../../../../lib/server/mongodb';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../lib/server/authOptions';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id ?? null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;
  const client = await clientPromise;
  const profiles = client.db(DB_NAME).collection('dj_profiles');

  if (req.method === 'GET') {
    const profile = await profiles.findOne({ ownerId: userId }, { projection: { feedTemplates: 1 } });
    const template = profile?.feedTemplates?.find(t => t.id === id);
    if (!template) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json(template);
  }

  if (req.method === 'PUT') {
    const { name, designedFor, slides } = req.body ?? {};
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const updates = {
      'feedTemplates.$.name': name.trim(),
      'feedTemplates.$.designedFor': designedFor ?? '16:9',
      'feedTemplates.$.updatedAt': new Date().toISOString(),
    };
    if (Array.isArray(slides)) updates['feedTemplates.$.slides'] = slides;
    const result = await profiles.updateOne(
      { ownerId: userId, 'feedTemplates.id': id },
      { $set: updates }
    );
    if (!result.matchedCount) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    await profiles.updateOne(
      { ownerId: userId },
      { $pull: { feedTemplates: { id } } }
    );
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
