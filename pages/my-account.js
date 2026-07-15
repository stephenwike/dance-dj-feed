import Head from 'next/head';
import Link from 'next/link';
import styles from './my-account.module.css';
import AppCard from '../components/AppCard';

const SECTIONS = [
  {
    icon: '💳',
    title: 'Wallet & Payouts',
    desc: 'Connect your payout account and manage earnings from tips.',
    href: '/dj-profile',
  },
  {
    icon: '📊',
    title: 'Reports',
    desc: 'View past session reports, track totals, and song history.',
    href: '/reports',
  },
  {
    icon: '⚙️',
    title: 'Standard Config',
    desc: 'Set default options like partner dances, voting, and weight decay.',
    href: null,
    soon: true,
  },
  {
    icon: '🎵',
    title: 'Playlists & Feed Templates',
    desc: 'Pre-load song lists and configure your attendee feed layout.',
    href: null,
    soon: true,
  },
];

export default function MyAccountPage() {
  return (
    <>
      <Head><title>My Account – DJ Feed</title></Head>
      <AppCard leftHref="/start" leftLabel="← Sessions">
          <h1 className={styles.title}>My Account</h1>

          <div className={styles.sections}>
            {SECTIONS.map(s =>
              s.href ? (
                <Link key={s.title} href={s.href} className={styles.section}>
                  <span className={styles.icon}>{s.icon}</span>
                  <div className={styles.body}>
                    <span className={styles.sectionTitle}>{s.title}</span>
                    <span className={styles.desc}>{s.desc}</span>
                  </div>
                  <span className={styles.arrow}>→</span>
                </Link>
              ) : (
                <div key={s.title} className={`${styles.section} ${styles.sectionDisabled}`}>
                  <span className={styles.icon}>{s.icon}</span>
                  <div className={styles.body}>
                    <span className={styles.sectionTitle}>{s.title}</span>
                    <span className={styles.desc}>{s.desc}</span>
                  </div>
                  <span className={styles.badge}>Soon</span>
                </div>
              )
            )}
          </div>
      </AppCard>
    </>
  );
}
