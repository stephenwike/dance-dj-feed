# Workflow: Start a Session

**Actor:** DJ (Clerk-authenticated)  
**Entry point:** `/start`  
**Outcome:** A new DJ session is created (or an existing active session is resumed), and the DJ lands on the appropriate controller.

---

## Preconditions

- DJ is signed in via Clerk
- No session is currently active, OR the DJ wants to resume an existing active session

---

## Pricing

Session duration is priced per tier (see `lib/dj/sessionPricing.js`):

| Duration | Minutes | Price |
|---|---|---|
| 2 hrs | 120 | $3 |
| 5 hrs | 300 | $5 |
| 12 hrs | 720 | $8 |
| 1 day | 1440 | $10 |

### Free Access (Allowlist)

Email addresses listed in `DJ_FREE_SESSION_EMAILS` (comma-separated, server env var) always get
the free/noop checkout branch — they never see Stripe Checkout, regardless of
`NEXT_PUBLIC_PAYMENTS_ENABLED`. The checkout endpoint resolves the DJ's email via
`clerkClient().users.getUser()` and checks it against the list (case-insensitive).
Intended for the operator's own account and DJs doing live testing.
See `lib/server/dj/sessionAccess.js#isFreeSessionEmail`.

## Plugin Add-ons

The page shows an informational note: additional music-source plugins (Spotify, Apple Music,
Local Library, etc.) will become available in a future release as optional paid add-ons. This
release runs on the Standard source only. The note is text only — no charge or reservation
action is taken today.

---

## Happy Path — Create New Session

1. DJ navigates to `/start`
2. Page calls `GET /api/dj/sessions` to check for an existing active session
3. No active session found — creation form is displayed
4. DJ optionally enters a session name (defaults to today's date if blank)
5. DJ selects a duration tier (2 hrs/$3, 5 hrs/$5, 12 hrs/$8, 1 day/$10)
6. DJ clicks **Start Event**
7. Client calls `POST /api/dj/sessions/checkout` with `{ name, durationMinutes, returnUrl }`
   (`plugin` is omitted by the client and defaults server-side to `'standard'`). Server behavior:
   - **Payments disabled, or this DJ is on the `DJ_FREE_SESSION_EMAILS` allowlist**: server
     creates the session immediately for free (same doc shape as below) and returns
     `{ session }`. Client redirects straight to `/dj-controller`.
   - **Payments enabled and DJ not on the allowlist**: server creates a Stripe Checkout session
     for the tier price and returns `{ url }`. Client redirects to Stripe. On
     `checkout.session.completed`, the `/api/beats/webhook` handler creates the session document
     (see Side Effects).
8. Session creation (either path), via `lib/server/dj/sessionLogic.js#createSession`:
   - Closes all other active sessions owned by this DJ (`status: 'closed'`)
   - Creates a new session document in `dj_sessions` with `status: 'active'`, `ownerId`, `slug`, `startedAt`, `endsAt`
9. Client redirects to `/dj-controller`.

---

## Alternate Path — Resume Active Session

1. DJ navigates to `/start`
2. `GET /api/dj/sessions` returns an active session
3. Page shows a "Resume" prompt with the session name and start time
4. DJ clicks **Resume**
5. Client redirects to the controller that matches the session's `plugin` field

---

## Alternate Path — Return from Stripe Checkout (payments enabled)

1. After a successful payment, Stripe redirects the browser to `/start?session_started=1`
2. Page strips the query param and shows a "Finishing setup…" state
3. Page polls `GET /api/dj/sessions` (up to 5 attempts, 2s apart) for a newly active session
4. Once found, redirects to the controller for that session's `plugin`
5. If the webhook hasn't completed after all attempts, shows a message asking the DJ to refresh

---

## Validation

| Field | Rule |
|---|---|
| `name` | Optional; max ~100 chars; defaults server-side to today's date |
| `plugin` | Optional; not sent by the UI. Defaults to `'standard'`; if provided, must be `'standard'` or `'spotify'` |
| `durationMinutes` | Required; one of 120, 300, 720, 1440 |

---

## API

`POST /api/dj/sessions/checkout`

```json
{
  "name": "Friday Night",
  "durationMinutes": 120,
  "returnUrl": "https://.../start"
}
```

Response (payments disabled, or DJ on the free-access allowlist — noop):
```json
{ "session": { "_id": "...", "slug": "...", "status": "active", "endsAt": "..." } }
```

Response (payments enabled and DJ not on the allowlist):
```json
{ "url": "https://checkout.stripe.com/..." }
```

`POST /api/dj/sessions` remains available as a lower-level endpoint (used internally by the
checkout route's noop branch and by tests) — same request/response shape as before.

---

## Side Effects

- All previous active sessions for this DJ are closed when a new session is created
- Session slug is generated from the name (URL-safe, e.g. `friday-night`)
- The feed and request QR code URLs are derived from the slug
- When payments are enabled, the `dj_sessions` document is created by `/api/beats/webhook` on
  `checkout.session.completed` (metadata `type: 'dj_session'`), not by the checkout request itself

---

## Error States

| Condition | Behavior |
|---|---|
| Not signed in | Clerk middleware redirects to sign-in |
| `POST /api/dj/sessions/checkout` fails | Error shown on form; no redirect |
| Invalid `durationMinutes`/`plugin` | `400` from checkout endpoint; error shown on form |
| Stripe Checkout cancelled | Browser returns to `/start` with no `session_started` param; form shown again; no session created |
| Webhook delayed past polling window | "Finishing setup" message asks the DJ to refresh |
