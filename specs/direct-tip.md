# Workflow: Direct Tip (Cash, No Account Required)

**Actor:** Attendee (no sign-in required)  
**Entry point:** `/dj-request` or `/request/[slug]` — "Tip the DJ" section  
**Outcome:** The attendee sends a cash tip directly to the DJ via Stripe; the full requested amount reaches the DJ's wallet.

---

## How This Differs From Beat Tipping

| | Beat Tip | Direct Tip |
|---|---|---|
| Account required | Yes (Clerk) | No |
| Currency | Beats (in-app) | USD (Stripe) |
| DJ receives | 90% of face value | 100% of requested amount |
| Processing fee | Built into beat purchase price | Shown to attendee at checkout |
| Boost to request | Yes (`tipCents` incremented) | No (generic tip, not tied to a request) |

---

## Preconditions

- An active DJ session exists
- `NEXT_PUBLIC_PAYMENTS_ENABLED=true`
- DJ has a connected Stripe Express account (or tip is held in platform wallet until connected)

---

## Steps

1. Attendee scrolls to the **Tip the DJ** section on the request form
2. Attendee enters a tip amount (minimum $1.00)
3. Page calculates and displays the Stripe processing fee: `2.9% + $0.30`
   - Example: $5.00 tip → attendee pays $5.45 → DJ receives $5.00
4. Attendee taps **Tip $5.00**
5. Client calls `POST /api/tips/direct`:
   ```json
   {
     "amountCents": 500,
     "sessionId": "..."
   }
   ```
6. Server:
   - Looks up the DJ's `stripeAccountId` from `dj_profiles`
   - Creates a Stripe Checkout session:
     - Line item: tip amount
     - Extra line item: processing fee
     - `metadata.type: 'direct_tip'`
     - `metadata.ownerId` (DJ's userId)
     - `metadata.amountCents` (amount DJ should receive)
   - Returns the Checkout URL
7. Attendee is redirected to Stripe's hosted checkout page
8. Attendee completes payment
9. Stripe sends `POST /api/beats/webhook` with `checkout.session.completed`
10. Server (webhook handler):
    - Reads `metadata.type === 'direct_tip'`
    - Inserts `dj_wallet_transactions` (`type: 'direct_tip'`, `amountCents: metadata.amountCents`)
11. Attendee is redirected back to the request page
12. No beat balance change; no request boost

---

## Fee Display

The fee breakdown is shown before the attendee confirms:

```
You pay:    $5.45
DJ receives: $5.00
Processing fee: $0.45 (Stripe 2.9% + $0.30)
```

The processing fee is charged to the attendee, not deducted from the DJ's amount. This is communicated clearly in the UI.

---

## DJ Wallet Credit

Direct tips accumulate in `dj_wallet_transactions` as `type: 'direct_tip'`. They are included in the DJ's available balance shown on `/dj-profile`. The DJ can withdraw any amount ≥ $1.

---

## Error States

| Condition | Behavior |
|---|---|
| Amount below $1.00 | Input validation; button disabled |
| `POST /api/tips/direct` fails | Error shown; no redirect |
| DJ has no Stripe account | Tip is still accepted; stored in wallet for when they connect |
| Stripe Checkout fails | Error shown with retry option |

---

## Notes

- Direct tips are not linked to a specific dance request — they are a general appreciation tip
- The attendee does not need to be signed in; no `attendeeId` is stored on direct tip transactions
- The disclaimer "Tips boost odds of a request being played — no guarantee" applies to beat tips; direct tips make no claim about request prioritization
