import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Persisted across dev server restarts — Stripe CLI keeps running even when Next.js restarts.
const HEALTH_FILE = join(tmpdir(), '.line-dance-stripe-health');
const MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

function readPersistedTime() {
  try {
    const { lastReceivedAt } = JSON.parse(readFileSync(HEALTH_FILE, 'utf8'));
    return lastReceivedAt ? new Date(lastReceivedAt) : null;
  } catch {
    return null;
  }
}

export function markWebhookReceived() {
  const now = new Date();
  global.__stripeWebhookLastReceivedAt = now;
  try { writeFileSync(HEALTH_FILE, JSON.stringify({ lastReceivedAt: now.toISOString() })); } catch {}
}

export function getStripeStatus() {
  const lastReceivedAt = global.__stripeWebhookLastReceivedAt ?? readPersistedTime();
  if (!lastReceivedAt) return { active: false, lastReceivedAt: null };
  const active = (Date.now() - new Date(lastReceivedAt).getTime()) < MAX_AGE_MS;
  return { active, lastReceivedAt };
}
