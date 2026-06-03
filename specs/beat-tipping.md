# Workflow: Beat Tipping

**Actors:** Attendee (signed in), DJ (recipient)  
**Entry points:** `/dj-request`, `/request/[slug]`, Beat shop modal  
**Outcome:** Attendee spends beats to boost a dance request's fairness score; DJ's wallet is credited.

---

## What Beats Are

Beats are in-app currency purchased by attendees. They have a face value of $0.05 to the DJ, but the exchange rate is never shown in the UI — only the beat count is displayed.

When an attendee tips a request, the DJ receives **90% of the face value** (i.e. a 10-beat tip = $0.45 to DJ). The remaining 10% is platform revenue.

Beats are non-refundable. Tips are non-refundable (a tip boosts request odds; it does not guarantee the DJ plays the song).

---

## Purchase Beats

### Entry Point
Attendee taps **Get Beats** on the request form, or is prompted when they try to tip without sufficient balance.

### Steps

1. Client calls `GET /api/beats/balance` — returns current beat count
2. Beat tier list is displayed:

   | Tier | Price | Beats |
   |---|---|---|
   | Starter | $4.99 | 82 |
   | Standard | $9.99 | 175 |
   | Popular ⭐ | $24.99 | 450 |
   | Value | $49.99 | 920 |
   | Mega | $99.99 | 1,880 |

3. Attendee selects a tier and taps **Buy**
4. Client calls `POST /api/beats/checkout` with `{ packageId }`
5. Server creates a Stripe Checkout session with:
   - `metadata.type: 'beat_purchase'`
   - `metadata.attendeeId`
   - `metadata.beats` (total beats for this tier)
6. Attendee is redirected to Stripe's hosted checkout page
7. Attendee completes payment with card
8. Stripe sends `POST /api/beats/webhook` with `checkout.session.completed`
9. Server (webhook handler):
   - Verifies Stripe signature
   - Upserts `beat_balances` (atomically increments `beats`)
   - Inserts `beat_transactions` record (`type: 'purchase'`)
10. Attendee is redirected back to the request page
11. `GET /api/beats/balance` is re-fetched; updated count shown

---

## Tip a Request on Submission

### Steps

1. Attendee opens the request form
2. If `tippingEnabled: true` on the session and attendee is signed in, `BeatTipper` component is rendered
3. Attendee selects a beat amount (stepper or preset values)
4. Beat cost is shown: "5 beats → boosts your request"
5. Attendee submits the form
6. `POST /api/dj/requests` body includes `{ tipCents: beats * 5 }`
7. Server:
   - Creates request with `tipCents` set
   - Deducts beats from `beat_balances` atomically
   - Inserts `beat_transactions` record (`type: 'tip'`, negative beats)
   - Inserts `dj_wallet_transactions` record (`type: 'beat_tip'`, `amountCents = beats * 5 * 0.9`)

---

## Quick-Tip an Existing Request

### Steps

1. Attendee sees their active request in the pending panel
2. Taps the **+1** button (adds 1 beat)
3. Button debounces for 600ms to prevent double-taps
4. Client calls `POST /api/beats/tip`:
   ```json
   {
     "requestId": "...",
     "beats": 1
   }
   ```
5. Server:
   - Verifies attendee has sufficient balance
   - Atomically deducts 1 beat from `beat_balances`
   - Increments `tipCents` on the request by 5 (1 beat × $0.05)
   - Inserts `beat_transactions` (type: `'tip'`, beats: -1)
   - Inserts `dj_wallet_transactions` (type: `'beat_tip'`, amountCents: 4 — 90% of 5¢)
6. Updated vote weight visible on next poll

### BeatBooster Modal
For larger quick-tips, the attendee can open the `BeatBooster` modal:
1. Tap the vote count chip on an active request
2. Modal shows preset amounts (5, 10, 25, 50 beats)
3. Attendee selects an amount and confirms
4. Same flow as above with the chosen beat count

---

## Effect on Fairness Scoring

When beats are added to a request, `tipCents` increases on the `dj_requests` document. The fairness score formula is:

```
score(dance) = Σ weight(requester) + tipCents / 100
```

A 10-beat tip adds `50 / 100 = 0.5` to the group score, boosting it in the DJ's pending panel.

---

## Beat Balance Display

- Shown in the request page header when attendee is signed in
- Updated after each tip and after each purchase
- If balance is 0, the quick-tip button is disabled and a "Get Beats" prompt is shown

---

## Error States

| Condition | Behavior |
|---|---|
| Insufficient balance on quick-tip | Error toast; Beat shop opens |
| Stripe Checkout creation fails | Error shown; no redirect |
| Webhook arrives with unknown session ID | Logged and ignored |
| Duplicate webhook event | Idempotent: upsert on `beat_balances` uses atomic `$inc`, so duplicate events would double-credit — webhook deduplication via Stripe event ID should be implemented |

---

## Constraints

- Beat tipping requires Clerk sign-in (anonymous attendees cannot tip)
- `NEXT_PUBLIC_PAYMENTS_ENABLED=true` must be set for the beat UI to render
- Beats are non-transferable between attendees
- Beats do not expire during a session; they persist in `beat_balances` across sessions
