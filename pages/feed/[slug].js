import clientPromise, { DB_NAME } from '../../lib/server/mongodb';

// Stable, shareable feed URL. The feed itself is rendered by /feed-preview;
// this route only resolves the slug to the active session and redirects.
export default function FeedSlugPage() {
  return null;
}

export async function getServerSideProps({ params }) {
  const { slug } = params;
  const client = await clientPromise;
  const session = await client.db(DB_NAME).collection('dj_sessions').findOne(
    { slug, status: 'active' },
    { projection: { _id: 1 } }
  );
  if (!session) return { notFound: true };
  return {
    redirect: {
      destination: `/feed-preview?sessionId=${String(session._id)}`,
      permanent: false,
    },
  };
}
