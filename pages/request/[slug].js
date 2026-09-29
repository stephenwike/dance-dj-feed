import clientPromise, { DB_NAME } from '../../lib/server/mongodb';
import DJRequestPage from '../dj-request/index';

export default function RequestSlugPage(props) {
  return <DJRequestPage {...props} />;
}

export async function getServerSideProps({ params }) {
  const { slug } = params;
  const client = await clientPromise;
  const session = await client.db(DB_NAME).collection('dj_sessions').findOne(
    { slug },
    {
      sort: { startedAt: -1 },
      projection: {
        _id: 1, status: 1, ownerId: 1, requestsEnabled: 1, tippingEnabled: 1, partnerDancesEnabled: 1,
        queueVisibleToRequesters: 1, queueVisibleCount: 1,
      },
    }
  );
  if (!session) return { notFound: true };
  const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';
  return {
    props: {
      sessionId: session.status === 'active' ? String(session._id) : null,
      djId: session.ownerId ?? null,
      // A draft has not started yet ("Not started"), which is different from ended.
      sessionEnded: session.status === 'closed',
      requestsEnabled: session.requestsEnabled !== false,
      tippingEnabled: paymentsEnabled && session.tippingEnabled !== false,
      partnerDancesEnabled: session.partnerDancesEnabled !== false,
      queueVisibleToRequesters: session.queueVisibleToRequesters !== false,
      queueVisibleCount: session.queueVisibleCount ?? 4,
    },
  };
}
