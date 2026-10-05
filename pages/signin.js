import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { signIn } from 'next-auth/react';
import styles from './signin.module.css';

// next-auth's sign-in errors that mean "try again" rather than "you can't".
const ERROR_TEXT = {
  OAuthSignin: 'We couldn’t reach the sign-in service.',
  OAuthCallback: 'Sign-in didn’t finish.',
  Callback: 'Sign-in didn’t finish.',
  AccessDenied: 'Sign-in was cancelled.',
  SessionRequired: 'Please sign in to continue.',
};

/**
 * Sign-in (next-auth's `pages.signIn`). There is one way to sign in, so
 * rather than a lone "Sign in with DanceFeed" button the page goes straight
 * on to it, and comes back to `callbackUrl`. After a failed attempt
 * (?error=) it explains and offers to try again instead of looping.
 */
export default function SignInPage() {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const callbackUrl = typeof router.query.callbackUrl === 'string' ? router.query.callbackUrl : '/start';
  const error = typeof router.query.error === 'string' ? router.query.error : null;

  function go() {
    setStarted(true);
    signIn('ldco', { callbackUrl });
  }

  useEffect(() => {
    if (router.isReady && !error) go();
  }, [router.isReady]);

  return (
    <>
      <Head><title>Signing in · DanceFeed</title></Head>
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logo}>🎛️</div>
          {error ? (
            <>
              <h1 className={styles.title}>Let’s try that again</h1>
              <p className={styles.sub}>{ERROR_TEXT[error] ?? 'Something went wrong signing you in.'}</p>
              <button type="button" className={styles.btn} onClick={go} disabled={started}>
                {started ? 'Signing in…' : 'Sign in to DanceFeed'}
              </button>
            </>
          ) : (
            <>
              <span className={styles.spinner} aria-hidden="true" />
              <h1 className={styles.title}>Signing you in…</h1>
              <p className={styles.sub}>Taking you to your DanceFeed account.</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
