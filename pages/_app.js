import { Montserrat } from 'next/font/google';
import { SWRConfig } from 'swr';
import { SessionProvider } from 'next-auth/react';
import '../styles/globals.css';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '600', '800'],
  variable: '--font-sans',
  display: 'swap',
});

const fetcher = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

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
