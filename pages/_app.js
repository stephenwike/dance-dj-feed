import { Montserrat } from 'next/font/google';
import { SWRConfig } from 'swr';
import { SessionProvider } from 'next-auth/react';
import '../styles/globals.css';
import { fetcher } from '../lib/client/fetcher';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '600', '800'],
  variable: '--font-sans',
  display: 'swap',
});

export default function App({ Component, pageProps: { session, ...pageProps } }) {
  return (
    <SessionProvider session={session}>
      {/* Keep dedupingInterval short: SWR dedupes refreshInterval polls too, so
          a long window here silently slows every poll to that window (a 60s
          value once made the TV feed lag the controller by up to a minute).
          Static data that should be fetched rarely sets its own, longer one. */}
      <SWRConfig value={{ fetcher, revalidateOnFocus: false, dedupingInterval: 2_000 }}>
        <div className={montserrat.variable}>
          <Component {...pageProps} />
        </div>
      </SWRConfig>
    </SessionProvider>
  );
}
