import Link from 'next/link';
import { signOut } from 'next-auth/react';
import styles from './AppCard.module.css';

export default function AppCard({ children, leftHref, leftLabel }) {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          {leftHref
            ? <Link href={leftHref} className={styles.navLink}>{leftLabel}</Link>
            : <span />}
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => signOut({ callbackUrl: '/' })}
          >
            Log out
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
