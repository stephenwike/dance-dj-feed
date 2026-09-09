# Beat Economics

**Status:** Accepted  
**Last updated:** 2026-09-09

## What is a beat?

A beat is the platform's virtual currency used by event attendees to tip DJs for song requests. Beats have a fixed **face value of $0.05** (5 cents). This is the exact amount credited to the DJ's wallet when a beat is tipped — DJs receive 100% of face value.

## Revenue model

The platform earns revenue from two sources: the margin between purchase revenue (net of Stripe fees) and the face value of beats delivered, and session fees. Beat tips pass 100% of face value to the DJ — no tip-time cut.

## How attendees buy beats

Package prices are **immutable**. Beats are split into **base** (the core quantity) and **bonus** (a volume incentive for larger packages). The total (base + bonus) × $0.05 never exceeds what the platform receives after Stripe fees — the platform never loses money on a sale.

Stripe processing fee: **2.9% + $0.30** per transaction.

| Package | Price | Stripe fee | Platform receives | Base | Bonus | Total beats | Cost/beat | Platform keeps | Platform keeps/beat |
|---------|-------|------------|-------------------|------|-------|-------------|-----------|----------------|---------------------|
| Micro | $1.00 | $0.33 | $0.67 | 12 | — | **12** | $0.0833 | $0.07 | 0.58¢ |
| Starter | $4.99 | $0.44 | $4.55 | 75 | +7 | **82** | $0.0609 | $0.45 | 0.55¢ |
| Standard | $9.99 | $0.59 | $9.40 | 150 | +25 | **175** | $0.0571 | $0.65 | 0.37¢ |
| Popular | $24.99 | $1.02 | $23.97 | 400 | +50 | **450** | $0.0555 | $1.47 | 0.33¢ |
| Value | $49.99 | $1.75 | $48.24 | 800 | +120 | **920** | $0.0543 | $2.24 | 0.24¢ |
| Mega | $99.99 | $3.20 | $96.79 | 1,600 | +280 | **1,880** | $0.0532 | $2.79 | 0.15¢ |

**Platform keeps** = platform receives − (total beats × $0.05). The per-beat margin decreases with package size, meaning larger packages give buyers progressively better value — the whole point of the bonus beat structure.

> **The face value ($0.05) is very close to but under the Mega package's effective per-beat cost ($0.0532).** A Mega buyer who tips every beat pays $0.0532/beat; the DJ receives $0.05 — keeping 94% of what the attendee paid.

## How beats are used as tips

Attendees spend beats to tip a DJ for a specific song request. Each beat spent:
- Is deducted from the attendee's `beat_balances` document (atomic — fails if insufficient)
- Adds 5¢ to the request's `tipCents` field (visible running tip total)
- Credits exactly 5¢ to the DJ's wallet via a `dj_wallet_transactions` entry

`DJ_CUT = 1.0` — DJs receive 100% of face value. `tipCents` on a request equals the DJ's wallet earnings from that request exactly.

## How DJs withdraw earnings

DJ earnings accumulate in `dj_wallet_transactions` (a ledger of `amountCents` entries). The running balance is the sum of all entries — positive credits from tips, negative debits from withdrawals.

When a DJ requests a withdrawal:
1. Server verifies a connected Stripe account exists and payouts are enabled
2. Computes current balance by summing `dj_wallet_transactions`
3. Creates a Stripe **transfer** from the platform's Stripe balance to the DJ's connected account
4. Records a negative `withdrawal` entry in `dj_wallet_transactions`
5. Minimum withdrawal: **$1.00** (100¢)

Stripe transfer settlement typically takes 2–3 business days.

## Historical correction

Prior to 2026-09-09, `DJ_CUT` was `0.9`, which shorted DJs ~10% of face value per beat tipped. A one-time migration script (`scripts/migrate-dj-cut.js`) inserts `dj_cut_correction` entries into `dj_wallet_transactions` to make affected DJs whole. Run with `--dry-run` first to preview changes.

## Platform revenue summary

| Source | Notes |
|--------|-------|
| Beat sale margin | $0.07–$2.79 per package; per-beat margin decreases for larger packages |
| Tip cut | $0.00 — 100% of face value goes to DJ |
| Session fees | Flat per-session charge; see session-pricing.md |

## Key constants (code references)

| Constant | Value | File |
|----------|-------|------|
| `BEAT_VALUE_CENTS` | `5` | `pages/api/beats/tip.js` |
| `DJ_CUT` | `1.0` | `pages/api/beats/tip.js` |
| `BEAT_PACKAGES` | see table above | `lib/beats/packages.js` |
| `MIN_WITHDRAWAL` | `100` (¢) | `pages/api/dj/withdraw.js` |
