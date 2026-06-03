# Workflow: Attendee Dance Request

**Actor:** Attendee (anonymous or signed in)  
**Entry point:** `/dj-request` or `/request/[slug]` (via QR code scan)  
**Outcome:** The attendee submits a dance request that appears in the DJ's pending panel.

---

## Preconditions

- An active DJ session exists
- The attendee has a device fingerprint (`dj_clientId`) stored in `localStorage` (auto-created on first visit)
- If submitting via slug URL, the session is resolved server-side from the slug

---

## Happy Path — Submit a Line Dance Request

1. Attendee scans the QR code on the feed display
2. Page loads with the active session context (sessionId, djId, tippingEnabled)
3. Page calls `GET /api/dj/dances` — returns available dances joined with track metadata
4. Page calls `GET /api/dj/requests` — returns existing requests for the session
5. Attendee sees the dance list (filtered: dances they've already requested are hidden)
6. Attendee selects a dance
7. Optionally adds a **song swap** (different song for the same dance):
   - Taps "Song Swap" toggle
   - Enters song name and artist
8. Optionally types a **note** to the DJ
9. If tipping is enabled and the attendee is signed in:
   - Beat Tipper component is shown below the form
   - Attendee can attach beats to the request (boosts fairness score)
10. Attendee taps **Submit Request**
11. Client calls `POST /api/dj/requests` with:
    ```json
    {
      "sessionId": "...",
      "danceId": "...",
      "danceName": "Electric Slide",
      "songName": "Electric Boogie",
      "artist": "Marcia Griffiths",
      "clientId": "<fingerprint>",
      "isSongSwap": false,
      "notes": "",
      "tipCents": 0
    }
    ```
12. Server creates the request with `status: 'pending'`, `queuePosition: 0`
13. Confirmation shown; request appears immediately in the attendee's Active Requests panel

---

## Alternate Path — Partner Dance Request

1. Attendee taps the **Partner Dances** tab (only visible if session has `partnerDancesEnabled: true`)
2. A different dance list is shown filtered to `danceType: 'partner'`
3. Steps 6–13 above apply; `danceType: 'partner'` is included in the POST body

---

## Alternate Path — Custom Request

If a dance isn't in the catalogue, the attendee can type a freeform request:
1. Attendee types in the "Custom request" field
2. Enters dance name and song/artist
3. `danceId` is `null` in the POST body; server stores as a free-form request

---

## Active Requests Panel

After submitting, the attendee sees their pending and approved requests:

- **Vote count** — number of other attendees who also requested this dance (aggregate of tip weight)
- **Quick-tip** button — taps `+1` beat tip (600ms debounce, uses `POST /api/beats/tip`)
- **Status indicator** — pending / approved / playing
- **Played history tab** — dances already played this session

---

## Beat Tipping on Submission

If the attendee is signed in and has a beat balance:
1. `BeatTipper` component appears in the form
2. Attendee selects how many beats to attach (increments)
3. Beats are sent in the POST body (`tipCents = beats * 5`)
4. Server records the tip on the request and deducts from the attendee's `beat_balances`

---

## Quick-Tip on Existing Request

1. Attendee taps the **+1** button on an active request in the panel
2. Button debounces 600ms (prevents accidental double-taps)
3. Client calls `POST /api/beats/tip` with `{ requestId, beats: 1 }`
4. Server deducts 1 beat from attendee balance, credits DJ wallet, increments `tipCents` on request
5. Vote count on the request updates on next poll

---

## Beat Shop

If the attendee needs more beats:
1. Attendee taps **Get Beats** in the request page
2. Beat purchase tier list is shown (Starter / Standard / Popular / Value / Mega)
3. Attendee selects a tier and taps **Buy**
4. Client calls `POST /api/beats/checkout` — returns a Stripe Checkout URL
5. Attendee completes payment on Stripe's hosted page
6. Stripe calls `POST /api/beats/webhook` with `checkout.session.completed`
7. Server credits beats to `beat_balances`, records `beat_transactions`
8. Attendee is redirected back to the request page with updated balance

---

## Direct Tip (No Account Required)

1. Attendee taps **Tip the DJ** (direct tip section, no beats)
2. Enters tip amount (any amount ≥ $1)
3. Client calls `POST /api/tips/direct` with `{ amountCents, sessionId }`
4. Server calculates Stripe processing fee (2.9% + $0.30), shows breakdown
5. Returns Stripe Checkout URL
6. Attendee completes payment
7. Stripe webhook credits the full requested amount to the DJ wallet

---

## Identity

Attendees are identified by a device fingerprint (`dj_clientId`) stored in `localStorage`. This:
- Prevents the same device from seeing the same dance in the available list twice
- Scopes "my requests" in the Active Requests panel
- Does not require an account

Signing in with Clerk enables beat purchasing and beat tipping. The `clientId` is still used for request ownership.

---

## Constraints

| Rule | Detail |
|---|---|
| One pending request per dance per attendee | Duplicate prevention on the client (dance hidden once requested) |
| Session must be active | Request form shows "Session has ended" if `status: 'closed'` |
| Tipping requires sign-in | Beat Tipper hidden if not authenticated |
| Song swap notes max length | Validated server-side |

---

## Error States

| Condition | Behavior |
|---|---|
| No active session | Form shows "No active session" message |
| POST fails (network) | Error shown; form stays filled |
| Beat tip fails (insufficient balance) | Error toast; balance refreshed |
| Stripe Checkout redirect fails | Error shown with retry option |
