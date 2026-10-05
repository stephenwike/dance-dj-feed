import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';

// Set before leaving for Stripe Checkout, so the controller can tell the
// session that was just paid for from older ones (see useController).
export const CHECKOUT_STARTED_KEY = 'dj_session_checkout_started_at';

/** The DJ's wallet balance in cents; null while loading or when payments are off. */
export function useWalletBalance() {
  const [balance, setBalance] = useState(null);
  useEffect(() => {
    if (!PAYMENTS_ENABLED) return;
    fetch('/api/dj/wallet').then(r => r.json()).then(d => setBalance(d.balance ?? 0)).catch(() => {});
  }, []);
  return balance;
}

/**
 * Go live: start a new session ({ name, durationMinutes, plugin }) or launch
 * a draft ({ draftSessionId }), by card — free when this DJ isn't charged —
 * or from the wallet. Either way the DJ lands in the controller, which shows
 * the "Get the room ready" card for the new session.
 */
export function useGoLive() {
  const router = useRouter();
  const [busy, setBusy] = useState(null); // 'card' | 'wallet' | null
  const [error, setError] = useState('');

  async function goLive(body, { wallet = false } = {}) {
    setBusy(wallet ? 'wallet' : 'card');
    setError('');
    try {
      const res = await fetch(wallet ? '/api/dj/sessions/wallet-pay' : '/api/dj/sessions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...body,
          // Stripe comes back to the controller when paid, or here if cancelled.
          returnUrl: `${window.location.origin}/dj-controller`,
          cancelUrl: window.location.href,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not start the event.'); return false; }
      if (data.url) {
        sessionStorage.setItem(CHECKOUT_STARTED_KEY, String(Date.now()));
        window.location.href = data.url;
        return true;
      }
      if (data.session) {
        await router.push(`/dj-controller?welcome=${data.session._id}`);
        return true;
      }
      setError('Unexpected response from the server.');
      return false;
    } catch {
      setError('Something went wrong. Check your connection.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  return { goLive, busy, error, setError };
}
