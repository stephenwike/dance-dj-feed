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
      <SWRConfig value={{ fetcher, revalidateOnFocus: false, dedupingInterval: 60_000 }}>
        <div className={montserrat.variable}>
          <Component {...pageProps} />
        </div>
      </SWRConfig>
    </SessionProvider>
  );
}
