import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/server/authOptions';
import clientPromise, { DB_NAME } from '../../../lib/server/mongodb';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });

  const email = (req.query.email ?? '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'email query parameter required' });

  const client = await clientPromise;
  const profile = await client.db(DB_NAME).collection('user_profiles').findOne(
    { email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
    { projection: { id: 1, name: 1 } }
  );

  if (!profile) return res.status(404).json({ error: 'No user found with that email' });
  return res.status(200).json({ id: profile.id, name: profile.name });
}
