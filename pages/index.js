import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useUser, SignInButton, SignUpButton } from '@clerk/nextjs';
import styles from './index.module.css';

export default function Home() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();

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

          {isLoaded && (
            <div className={styles.actions}>
              <SignUpButton fallbackRedirectUrl="/start" signInFallbackRedirectUrl="/start">
                <button className={styles.btnPrimary}>Get Started Free</button>
              </SignUpButton>
              <SignInButton fallbackRedirectUrl="/start" signUpFallbackRedirectUrl="/start">
                <button className={styles.btnSecondary}>Sign In</button>
              </SignInButton>
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
