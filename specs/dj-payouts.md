# Workflow: DJ Wallet and Payouts

**Actor:** DJ (Clerk-authenticated)  
**Entry point:** `/dj-profile`  
**Outcome:** The DJ sets up a payout account, views their earnings balance, and withdraws funds to their bank account.

---

## Preconditions

- DJ is signed in via Clerk
- DJ has received beat tips or direct tips (balance > 0) OR wants to set up payouts proactively

---

## Earning Balance

The DJ wallet accumulates from two sources:

| Source | Rate | Collection |
|---|---|---|
| Beat tip (from attendee) | 90% of face value (1 beat = $0.045 to DJ) | `dj_wallet_transactions` type: `beat_tip` |
| Direct tip (cash via Stripe) | 100% of requested amount | `dj_wallet_transactions` type: `direct_tip` |

Balance = Σ `amountCents` from all non-withdrawal, non-session-payment transactions for this `ownerId`.

---

## Set Up Payouts (Stripe Connect Onboarding)

### Steps

1. DJ visits `/dj-profile`
2. Client calls `GET /api/dj/connect/status`
   - Response: `{ connected: false }` — onboarding not started
3. Page shows **Set up payouts** button
4. DJ taps the button
5. Client calls `POST /api/dj/connect/onboard`
6. Server:
   - Creates a Stripe Express account (`stripe.accounts.create`)
   - Stores `stripeAccountId` in `dj_profiles`
   - Creates an onboarding link (`stripe.accountLinks.create`)
   - Returns the link URL
7. DJ is redirected to Stripe's hosted onboarding flow
8. DJ provides:
   - Legal name and business type
   - Bank account details
   - Identity verification (SSN last 4 or full, depending on volume)
   - 1099 tax information
9. After completion, Stripe redirects back to `/dj-profile`
10. Client calls `GET /api/dj/connect/status` again
    - Response: `{ connected: true, detailsSubmitted: true, payoutsEnabled: false }` (Stripe reviews within 1–2 business days)
    - Once approved: `{ payoutsEnabled: true }`

---

## Check Payout Status

`GET /api/dj/connect/status` returns:

```json
{
  "connected": true,
  "detailsSubmitted": true,
  "payoutsEnabled": true
}
```

| State | Meaning |
|---|---|
| `connected: false` | No Stripe account created yet |
| `connected: true, detailsSubmitted: false` | Account created but onboarding not completed |
| `connected: true, detailsSubmitted: true, payoutsEnabled: false` | Onboarding complete; Stripe reviewing |
| `connected: true, payoutsEnabled: true` | Ready to withdraw |

---

## Withdraw Funds

### Preconditions

- `payoutsEnabled: true`
- Available balance ≥ $1.00

### Steps

1. DJ sees available balance on `/dj-profile`
2. DJ enters a withdrawal amount (any amount from $1.00 up to available balance)
3. DJ taps **Withdraw**
4. Client calls `POST /api/dj/withdraw`:
   ```json
   { "amountCents": 1500 }
   ```
5. Server:
   - Verifies `payoutsEnabled` via Stripe account lookup
   - Verifies sufficient balance from `dj_wallet_transactions` sum
   - Creates a Stripe transfer to the DJ's Express account (`stripe.transfers.create`)
   - Inserts `dj_wallet_transactions` record (`type: 'withdrawal'`, negative `amountCents`, `stripeTransferId`)
6. Confirmation shown; balance updated

### Payout Timing

- **ACH bank transfer**: 1–2 business days (free)
- **Instant payout** (optional, if enabled on Stripe account): 1% fee, near-instant

---

## Transaction History

The profile page shows a list of all `dj_wallet_transactions` for the signed-in DJ, ordered by `createdAt` descending:

| Column | Description |
|---|---|
| Type | beat_tip / direct_tip / withdrawal / session_payment |
| Amount | Formatted in dollars, negative for withdrawals |
| Date | Relative ("2 hours ago") or absolute |
| Detail | Attendee name or request reference (if available) |

---

## Error States

| Condition | Behavior |
|---|---|
| Not signed in | Clerk redirects to sign-in |
| `POST /api/dj/connect/onboard` fails | Error shown; retry button |
| Withdrawal amount > balance | Validation error; button disabled |
| `payoutsEnabled: false` | Withdraw button disabled; status message shown |
| Stripe transfer fails | Error shown; no wallet transaction inserted (atomic) |

---

## Notes

- The minimum withdrawal is $1.00 — Stripe enforces a minimum payout; amounts below this accumulate until the threshold is met
- Stripe Connect Express handles KYC, 1099s, and bank account management on Stripe's side — the app does not store bank details
- Phase 4 will add `session_payment` transactions when DJ subscription billing is implemented
