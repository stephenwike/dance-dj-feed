import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import styles from './NavBar.module.css';

export default function NavBar() {
  const { status } = useSession();

  return (
    <nav className={styles.nav}>
      <Link href="/start" className={styles.brand}>DJ Feed</Link>
      <div className={styles.links}>
        {status === 'authenticated' ? (
          <>
            <Link href="/my-account" className={styles.link}>My Account</Link>
            <span className={styles.sep}>|</span>
            <button
              type="button"
              className={`${styles.link} ${styles.linkBtn}`}
              onClick={() => signOut({ callbackUrl: '/' })}
            >
              Log out
            </button>
          </>
        ) : status === 'unauthenticated' ? (
          <>
            <Link href="/login" className={styles.link}>Log in</Link>
            <span className={styles.sep}>|</span>
            <Link href="/signup" className={styles.link}>Sign up</Link>
          </>
        ) : null}
      </div>
    </nav>
  );
}
