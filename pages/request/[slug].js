import clientPromise, { DB_NAME } from '../../lib/server/mongodb';
import DJRequestPage from '../dj-request/index';

export default function RequestSlugPage({ sessionId, djId, sessionEnded, requestsEnabled, tippingEnabled, queueVisibleToRequesters, queueVisibleCount }) {
  return <DJRequestPage sessionId={sessionId} djId={djId} sessionEnded={sessionEnded} requestsEnabled={requestsEnabled} tippingEnabled={tippingEnabled} queueVisibleToRequesters={queueVisibleToRequesters} queueVisibleCount={queueVisibleCount} />;
}

export async function getServerSideProps({ params }) {
  const { slug } = params;
  const client = await clientPromise;
  const session = await client.db(DB_NAME).collection('dj_sessions').findOne(
    { slug },
    { sort: { startedAt: -1 }, projection: { _id: 1, status: 1, ownerId: 1, requestsEnabled: 1, tippingEnabled: 1, queueVisibleToRequesters: 1, queueVisibleCount: 1 } }
  );
  if (!session) return { notFound: true };
  const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';
  return {
    props: {
      sessionId: session.status === 'active' ? String(session._id) : null,
      djId: session.ownerId ?? null,
      sessionEnded: session.status !== 'active',
      requestsEnabled: session.requestsEnabled !== false,
      tippingEnabled: paymentsEnabled && session.tippingEnabled !== false,
      queueVisibleToRequesters: session.queueVisibleToRequesters !== false,
      queueVisibleCount: session.queueVisibleCount ?? 4,
    },
  };
}
