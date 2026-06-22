import { Montserrat } from 'next/font/google';
import { SWRConfig } from 'swr';
import { ClerkProvider } from '@clerk/nextjs';
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

export default function App({ Component, pageProps }) {
  return (
    <ClerkProvider {...pageProps}>
      <SWRConfig value={{ fetcher, revalidateOnFocus: false, dedupingInterval: 60_000 }}>
        <div className={montserrat.variable}>
          <Component {...pageProps} />
        </div>
      </SWRConfig>
    </ClerkProvider>
  );
}
