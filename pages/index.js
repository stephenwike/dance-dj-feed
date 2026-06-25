import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useSession, signIn } from 'next-auth/react';
import styles from './index.module.css';

export default function Home() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isLoaded = status !== 'loading';
  const isSignedIn = !!session;

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace('/start');
    }
  }, [isLoaded, isSignedIn, router]);

  return (
    <>
      <Head><title>DanceCard — Live Request Platform for DJs</title></Head>
      <div className={styles.page}>
        <div className={styles.hero}>
          <div className={styles.logo}>🎛️</div>
          <h1 className={styles.title}>DanceCard</h1>
          <p className={styles.tagline}>
            The live request platform for line dance DJs.
          </p>
          <p className={styles.sub}>
            Request queue &middot; Beat tipping &middot; Spotify integration
          </p>

          {isLoaded && !isSignedIn && (
            <div className={styles.actions}>
              <button className={styles.btnPrimary} onClick={() => signIn('ldco', { callbackUrl: '/start' })}>
                Get Started Free
              </button>
              <button className={styles.btnSecondary} onClick={() => signIn('ldco', { callbackUrl: '/start' })}>
                Sign In
              </button>
            </div>
          )}

          <p className={styles.deviceNote}>
            Already hosting tonight? Sign in to manage your session from any device.
          </p>
        </div>
      </div>
    </>
  );
}
