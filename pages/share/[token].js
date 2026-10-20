import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useSession, signIn } from 'next-auth/react';
import styles from './share.module.css';
import listStyles from '../reports/reports.module.css';
import clientPromise from '../../lib/server/mongodb';
import { getSharedReport } from '../../lib/server/dj/shareLogic';
import { shareMeta, shareSummary, formatShareTime } from '../../lib/dj/shareFormat';
import { diffColor } from '../../components/dj-controller/utils';
import DanceMarks, { SignInToSave, MarkToast } from '../../components/dj-request/DanceMarks';
import { useDanceMarks } from '../../lib/client/dancer/useDanceMarks';

/** The address this page was requested on, for absolute link-preview URLs. */
function originOf(req) {
  const proto = String(req.headers['x-forwarded-proto'] ?? 'http').split(',')[0];
  return `${proto}://${req.headers['x-forwarded-host'] ?? req.headers.host}`;
}

export async function getServerSideProps({ params, req, res }) {
  const report = await getSharedReport(await clientPromise, params.token);
  if (!report) return { notFound: true };
  // Live sessions change as dances play; closed ones are settled.
  res.setHeader('Cache-Control', `public, s-maxage=${report.live ? 60 : 600}, stale-while-revalidate=3600`);
  const origin = originOf(req);
  // A new image URL whenever its contents change, so apps that cache previews refetch it.
  const version = `${report.stats.dances}-${report.stats.requests}-${report.live ? 'l' : 'c'}`;
  return {
    props: {
      report,
      pageUrl: `${origin}/share/${params.token}`,
      imageUrl: `${origin}/api/share/${params.token}/image?v=${version}`,
    },
  };
}

function Stat({ value, label }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

/**
 * A DJ's session report, shared by link: anyone with it can view, no sign-in.
 * Signed-in dancers can ♥ favorite and ⚑ wishlist the dances (and favorite
 * partner-dance songs), as on the requester app; signed out, tapping one
 * asks them to sign in and brings them back here.
 */
export default function SharedReportPage({ report, pageUrl, imageUrl }) {
  const { stats } = report;
  const { status: authStatus } = useSession();
  const isSignedIn = authStatus === 'authenticated';
  const marks = useDanceMarks(isSignedIn);
  const [askSignIn, setAskSignIn] = useState(false);
  const title = `${report.name} · DanceFeed`;
  const description = `${shareMeta(report)} — ${shareSummary(report)}`;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="DanceFeed" />
        <meta property="og:title" content={report.name} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:image" content={imageUrl} />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={`${report.name}: ${shareSummary(report)}`} />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <div className={listStyles.page}>
        <header className={listStyles.header}>
          <Link href="/" className={styles.brand}>DanceFeed</Link>
          {report.live && <span className={`${listStyles.statusPip} ${listStyles.statusActive}`}>● Live</span>}
        </header>

        <main className={styles.main}>
          <h1 className={styles.title}>{report.name}</h1>
          <p className={styles.meta}>{shareMeta(report)}</p>

          <div className={styles.stats}>
            <Stat value={stats.dances} label={stats.dances === 1 ? 'dance played' : 'dances played'} />
            {stats.dancers > 0 && <Stat value={stats.dancers} label={stats.dancers === 1 ? 'dancer' : 'dancers'} />}
            {stats.requests > 0 && <Stat value={stats.requests} label={stats.requests === 1 ? 'request' : 'requests'} />}
            {stats.partnerDances > 0 && <Stat value={stats.partnerDances} label={stats.partnerDances === 1 ? 'partner dance' : 'partner dances'} />}
          </div>

          {report.tracks.length === 0 ? (
            <p className={listStyles.empty}>No dances played yet.</p>
          ) : (
            <ol className={listStyles.trackList}>
              {report.tracks.map((t, i) => (
                <li key={`${t.danceName}-${i}`} className={listStyles.trackRow}>
                  <span className={listStyles.trackNum}>{i + 1}</span>
                  <div className={listStyles.trackInfo}>
                    <div className={listStyles.trackPrimary}>
                      <span className={listStyles.trackName}>{t.danceName}</span>
                      <DanceMarks
                        danceId={t.danceType === 'partner' ? null : t.danceId}
                        trackId={t.danceType === 'partner' ? t.catalogTrackId : null}
                        danceName={t.danceType === 'partner' ? t.songName || t.danceName : t.danceName}
                        stepsheet={t.stepsheet}
                        marks={marks}
                        isSignedIn={isSignedIn}
                        onNeedSignIn={() => setAskSignIn(true)}
                      />
                      {t.playedAt && <span className={listStyles.trackTime}>{formatShareTime(t.playedAt, report.timeZone)}</span>}
                    </div>
                    <div className={listStyles.trackSecondary}>
                      {t.songName && <span>{t.songName}{t.artist ? ` — ${t.artist}` : ''}</span>}
                      {t.difficulty && <span className={listStyles.diffPip} style={{ background: diffColor(t.difficulty) }}>{t.difficulty}</span>}
                      {t.danceType === 'partner' && (
                        <span className={listStyles.partnerTag}>👫{t.partnerStyle ? ` ${t.partnerStyle}` : ' Partner'}</span>
                      )}
                      {t.requests > 1 && <span className={listStyles.requesterCount}>{t.requests} req</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <p className={styles.footer}>
            Requests and playlist by <Link href="/" className={listStyles.trackLink}>DanceFeed</Link>
          </p>
        </main>
      </div>

      <MarkToast toast={marks.toast} />
      {askSignIn && (
        <SignInToSave
          onSignIn={() => signIn('ldco', { callbackUrl: window.location.href })}
          onClose={() => setAskSignIn(false)}
        />
      )}
    </>
  );
}
