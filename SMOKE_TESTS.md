# Smoke Test Checklist

Run this checklist before any significant release or after completing a phase of development.

## Prerequisites

- App running locally on `http://localhost:4000`
- MongoDB running locally
- Two Clerk accounts created (DJ A = your primary account, DJ B = a second test account)
- **Browser setup:**
  - Browser 1 (Chrome normal window) → DJ A
  - Browser 2 (Chrome Incognito or Firefox) → DJ B
  - Browser 3 (any extra tab, no login needed) → Attendee

---

## 1. Authentication

| # | Step | Expected | Pass |
|---|------|----------|------|
| 1.1 | Visit `/dj-controller` while logged out | Redirected to Clerk sign-in page | ☐ |
| 1.2 | Visit `/dj-spotify` while logged out | Redirected to Clerk sign-in page | ☐ |
| 1.3 | Visit `/start` while logged out | Redirected to Clerk sign-in page | ☐ |
| 1.4 | Sign in as DJ A | Lands on controller, no PIN prompt | ☐ |
| 1.5 | Visit `/dj-feed` while logged out | Feed page loads (public) | ☐ |
| 1.6 | Visit `/dj-request` while logged out | Request page loads (public) | ☐ |
| 1.7 | Click UserButton → Sign out | Redirected away from controller | ☐ |

---

## 2. Session Management (single DJ)

Sign in as DJ A for this section.

| # | Step | Expected | Pass |
|---|------|----------|------|
| 2.1 | Click "+ New Session" | Session created, slug visible in session bar | ☐ |
| 2.2 | Note the slug shown in the "Open Feed" button URL | Slug format: `name-mon-dd` | ☐ |
| 2.3 | Click "Open Feed" | Opens `/feed/[slug]` in new tab | ☐ |
| 2.4 | Click "Open Requests" | Opens `/request/[slug]` in new tab | ☐ |
| 2.5 | Click "End" | Session closes, bar shows "No active session" | ☐ |
| 2.6 | Click "History" | Past session appears in list | ☐ |
| 2.7 | Click "Continue" on a past session | Session becomes active again | ☐ |

---

## 3. Slug Routing

| # | Step | Expected | Pass |
|---|------|----------|------|
| 3.1 | Navigate to `/feed/[active-slug]` | Feed page loads, shows correct session queue | ☐ |
| 3.2 | Navigate to `/request/[active-slug]` | Request form loads | ☐ |
| 3.3 | Navigate to `/feed/nonexistent-slug` | 404 page | ☐ |
| 3.4 | Navigate to `/request/nonexistent-slug` | 404 page | ☐ |
| 3.5 | End the active session, then navigate to its `/feed/[slug]` | 404 page (session inactive) | ☐ |
| 3.6 | Check QR code on `/feed/[slug]` page | QR encodes `/request/[slug]`, not `/dj-request` | ☐ |
| 3.7 | Scan or copy the QR URL | URL shown below QR matches `/request/[slug]` | ☐ |

---

## 4. Request Flow (single DJ)

DJ A has an active session. Attendee uses `/request/[slug]`.

| # | Step | Expected | Pass |
|---|------|----------|------|
| 4.1 | Attendee submits a request | Appears in DJ A's Pending panel | ☐ |
| 4.2 | DJ approves the request | Moves to Queue panel | ☐ |
| 4.3 | DJ marks request as Playing | Appears in feed as "Playing" with progress bar | ☐ |
| 4.4 | Submit a second request, approve it | Appears in "Up Next" on the feed | ☐ |
| 4.5 | DJ skips the playing track | Queue advances | ☐ |
| 4.6 | Wait for auto-advance timer to expire | Queue advances automatically, feed updates | ☐ |

---

## 5. Multi-Tenant Session Isolation

DJ A in Browser 1, DJ B in Browser 2. Both have active sessions simultaneously.

| # | Step | Expected | Pass |
|---|------|----------|------|
| 5.1 | DJ A creates session → note slug A | e.g. `friday-night-may-14` | ☐ |
| 5.2 | DJ B creates session → note slug B | e.g. `saturday-night-may-14` | ☐ |
| 5.3 | DJ A's session history | Shows only DJ A's sessions | ☐ |
| 5.4 | DJ B's session history | Shows only DJ B's sessions | ☐ |
| 5.5 | Attendee submits request at `/request/[slug-A]` | Appears in DJ A's controller only | ☐ |
| 5.6 | Check DJ B's controller | DJ A's request does NOT appear | ☐ |
| 5.7 | Attendee submits request at `/request/[slug-B]` | Appears in DJ B's controller only | ☐ |
| 5.8 | Check DJ A's controller | DJ B's request does NOT appear | ☐ |
| 5.9 | Open `/feed/[slug-A]` | Shows DJ A's queue only | ☐ |
| 5.10 | Open `/feed/[slug-B]` | Shows DJ B's queue only | ☐ |
| 5.11 | DJ A approves their request | Appears in `/feed/[slug-A]`, NOT in `/feed/[slug-B]` | ☐ |
| 5.12 | DJ B approves their request | Appears in `/feed/[slug-B]`, NOT in `/feed/[slug-A]` | ☐ |

---

## 6. Controller Features

| # | Step | Expected | Pass |
|---|------|----------|------|
| 6.1 | Toggle "Partners On/Off" | Setting persists, affects partner dance requests | ☐ |
| 6.2 | Cycle weight decay | Label cycles through Off / 30 min / 60 min / 2 hr | ☐ |
| 6.3 | Drag-and-drop queue items | Queue reorders, feed reflects new order | ☐ |
| 6.4 | Song swap request | Amber ↻ chip shows in controller and feed | ☐ |
| 6.5 | Repeat dance request | "Repeat" badge shows on the pending card | ☐ |

---

## Notes

- Re-run **section 5** after any change to API routes, middleware, or `requestLogic.js`
- Re-run **section 1** after any Clerk configuration change
- All 91 automated unit tests must pass (`pnpm test`) before running this checklist
