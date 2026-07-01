# line-dance-dj-feed

A real-time dance request platform for line dance DJs. Attendees scan a QR code to request dances; the DJ manages the queue, plays tracks via Spotify, and collects tips. The feed page shows the now-playing card and upcoming queue on a TV or projector.

Extracted from [dance-folly-website](../dance-folly-website) when the DJ tooling outgrew the instructor site. Working product name: **DanceFeed**.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Pages](#pages)
- [API Routes](#api-routes)
- [Data Models](#data-models)
- [Key Libraries](#key-libraries)
- [Environment Variables](#environment-variables)
- [Running Locally](#running-locally)
- [Tests](#tests)
- [Architecture Notes](#architecture-notes)

---

## Overview

Three audiences, three sets of pages:

| Audience | Pages | Description |
|---|---|---|
| **DJ** | `/start`, `/dj-controller`, `/dj-spotify`, `/reports`, `/dj-profile` | Session creation, queue management, earnings |
| **Attendees** | `/dj-request`, `/request/[slug]` | Request a dance, tip the DJ, view own requests |
| **Display** | `/dj-feed`, `/feed/[slug]` | TV/projector feed showing now-playing + queue |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14, Pages Router |
| UI | React 18, CSS Modules, Lucide Icons |
| Auth | Clerk (DJ auth; passwordless attendee auth in Phase 3) |
| Data fetching | SWR |
| Database | MongoDB — two databases: `bld` (DJ data) and `ldco` (dance catalogue) |
| Payments | Stripe (Checkout for beat purchases / direct tips; Express accounts for DJ payouts) |
| Music | Spotify Web API (playback, search, queue management) |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable |
| QR Codes | qrcode.react |
| Image export | html-to-image |
| Testing | Jest (CJS, no transform), node-mocks-http |

Dev port: **4000**

---

## Pages

### DJ Pages (Clerk-authenticated)

#### `/start`
Session creation and resumption. The DJ names the session (defaults to today's date), picks a duration, and chooses a music source (Standard or Spotify). If an active session already exists for the DJ, the page offers to resume it instead of creating a new one. On submit, calls `POST /api/dj/sessions` and redirects to the appropriate controller.

#### `/dj-controller`
Main queue management dashboard. Three-column layout:

- **Left — Queue**: Now-playing card, approved/upcoming tracks (drag-to-reorder via `SortableQueueItem` + `QueueCard`), session history (`SessionsPanel`)
- **Center — Pending**: Requests grouped by dance, sorted by fairness score + tip boost (`PendingCard`). Tabs for By Dance / By Requester
- **Right — Controls**: `RemoteControl` strip, session settings, message broadcasting, hamburger nav

Actions: approve, play, pause, skip, remove, reorder. Fairness scoring is recalculated on every poll. Auto-advance fires when the current track's duration expires (Standard mode).

#### `/dj-spotify`
Same queue management as `/dj-controller` but with an embedded Spotify playback panel (`SpotifyComponents`). All Spotify logic — polling, track-change detection, pre-queuing, and playback controls — lives in the `useSpotifyPlugin` hook. When Spotify naturally advances to the next track, the hook auto-marks the previous request played and queues the next Spotify URI. Manual controls (play/pause/skip) sync back to Spotify.

#### `/reports`
Post-session playlist report. Session list on the left; selected session shows played tracks (deduplicated by dance, with requester counts). Filters for partner dances and custom requests. Export as PNG or PDF.

#### `/dj-profile`
DJ wallet and payout management. Shows available balance (from beat tips + direct tips), Stripe Connect onboarding, withdrawal form, and transaction history.

---

### Public Pages

#### `/dj-feed` and `/feed/[slug]`
TV/projector display. Shows the QR code pointing at the request form, a now-playing card color-coded by difficulty level, up-next list (4 items) with estimated start times, and DJ announcements with countdown. Polls `GET /api/dj/requests` every 5 seconds and `GET /api/dj/messages` every 3 seconds.

#### `/dj-request` and `/request/[slug]`
Attendee request form. Features:
- Line dance or partner dance toggle
- Searchable dance list (filters out already-pending dances)
- Song swap option (same dance, different song)
- Optional note to DJ
- Beat tipping on submission (if signed in and tipping enabled)
- Active requests panel with vote counts and quick-tip button
- Played history tab
- Beat shop (purchase beat currency)
- Direct tip (cash tip via Stripe, no account required)

The slug-based version (`/request/[slug]`) is the shareable QR code destination; it resolves the session server-side so the URL stays stable between events.

---

## API Routes

### Sessions

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/dj/sessions` | DJ | List all sessions for the signed-in DJ |
| `POST` | `/api/dj/sessions` | DJ | Create session; closes prior active sessions |
| `GET` | `/api/dj/sessions/[id]` | DJ | Get session + played tracks for report |
| `PATCH` | `/api/dj/sessions/[id]` | DJ | Update status, settings (partner dances, decay, tipping) |

### Requests (Queue)

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/dj/requests` | Public | List requests for active session; joins track metadata |
| `POST` | `/api/dj/requests` | Public | Create request (attendee or DJ); triggers sibling marking |
| `PATCH` | `/api/dj/requests/[id]` | DJ or owner | Update status, position, play times, tip total |
| `DELETE` | `/api/dj/requests/[id]` | DJ or owner | Remove request |

### Dance Catalogue

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/dj/dances` | Public | Available dances from `ldco` DB, joined with track metadata |

### Messages

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/dj/messages` | Public | Get active message for a session |
| `POST` | `/api/dj/messages` | DJ | Post urgent or in-queue message |
| `PATCH` | `/api/dj/messages/[id]` | DJ | Dismiss message |

### Beats (In-App Currency)

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/beats/balance` | Attendee | Current beat balance |
| `POST` | `/api/beats/checkout` | Attendee | Stripe Checkout for beat purchase |
| `POST` | `/api/beats/tip` | Attendee | Spend beats on a request; credits DJ wallet |
| `POST` | `/api/beats/webhook` | Public (Stripe sig) | Handles `checkout.session.completed` for purchases and direct tips |

### Direct Tips

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/tips/direct` | Public | Stripe Checkout for a cash tip (no account needed) |

### DJ Wallet & Payouts

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/dj/wallet` | DJ | Balance + transaction history |
| `GET` | `/api/dj/connect/status` | DJ | Stripe Connect account state |
| `POST` | `/api/dj/connect/onboard` | DJ | Create Express account + return onboarding URL |
| `POST` | `/api/dj/withdraw` | DJ | Transfer balance to DJ's bank account |

### Spotify

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/spotify/auth` | Public | Redirect to Spotify OAuth |
| `GET` | `/api/spotify/callback` | Public | OAuth callback; stores tokens |
| `GET` | `/api/spotify/player` | Public | Current playback state + Spotify queue |
| `POST` | `/api/spotify/player` | Public | Add URI to Spotify queue |
| `PUT` | `/api/spotify/player` | Public | Playback controls (play, pause, next, seek, repeat) |
| `GET` | `/api/spotify/search` | Public | Search Spotify tracks |

---

## Data Models

### `dj_sessions` (database: `bld`)

```js
{
  _id: ObjectId,
  ownerId: string,               // Clerk userId
  name: string,                  // "Friday Night May 9"
  slug: string,                  // "friday-night-may-9"
  status: 'active' | 'closed',
  plugin: 'standard' | 'spotify',
  startedAt: Date,
  endsAt: Date,
  closedAt: Date | null,
  partnerDancesEnabled: boolean,
  weightDecayEnabled: boolean,
  weightDecayHalfLifeMinutes: number,
  tippingEnabled: boolean,
}
```

### `dj_requests` (database: `bld`)

```js
{
  _id: ObjectId,
  sessionId: string,
  ownerId: string,               // DJ's userId
  clientId: string,              // Attendee device fingerprint
  requesterName: string,
  danceId: string | null,        // FK to ldco.dances
  danceName: string,
  songName: string,
  artist: string,
  difficulty: string,            // "Beginner", "Intermediate", etc.
  stepsheet: string | null,      // URL
  duration_ms: number | null,
  spotifyUri: string | null,
  danceType: 'partner' | 'message' | null,
  partnerStyle: string | null,
  isSongSwap: boolean,
  swapSongName: string | null,
  swapArtist: string | null,
  notes: string,
  tipCents: number,
  isRepeat: boolean,
  status: 'pending' | 'approved' | 'playing' | 'played' | 'skipped',
  queuePosition: number,
  playStartedAt: Date | null,
  pausedAt: Date | null,
  advancedBy: 'standard' | 'spotify' | null,
  createdAt: Date,
  updatedAt: Date,
}
```

### `dj_messages` (database: `bld`)

```js
{
  _id: ObjectId,
  sessionId: string,
  ownerId: string,
  text: string,
  status: 'active' | 'dismissed',
  duration: number | null,       // seconds
  expiresAt: Date | null,
  createdAt: Date,
  updatedAt: Date,
}
```

### `beat_balances` (database: `bld`)

```js
{
  attendeeId: string,            // Clerk userId
  beats: number,
  updatedAt: Date,
}
```

### `beat_transactions` (database: `bld`)

```js
{
  attendeeId: string,
  type: 'purchase' | 'tip',
  beats: number,                 // negative for tips
  amountCents: number,
  requestId: string | null,
  stripeSessionId: string | null,
  createdAt: Date,
}
```

### `dj_wallet_transactions` (database: `bld`)

```js
{
  ownerId: string,
  type: 'beat_tip' | 'direct_tip' | 'withdrawal' | 'session_payment',
  amountCents: number,           // negative for withdrawals
  attendeeId: string | null,
  requestId: string | null,
  stripeTransferId: string | null,
  createdAt: Date,
}
```

### `dj_profiles` (database: `bld`)

```js
{
  ownerId: string,
  stripeAccountId: string,       // Stripe Express account ID
  createdAt: Date,
  updatedAt: Date,
}
```

### `dances` + `tracks` (database: `ldco`)

Shared line dance catalogue managed by a separate app ([line-dance-manager-admin](../line-dance-manager-admin)). Read-only from this app's perspective. The `GET /api/dj/dances` route joins these two collections to produce the dance list with Spotify URI and duration.

---

## Components

### `components/dj-controller/`

The controller page was refactored to extract its UI into focused components. All share the `dj-controller.module.css` stylesheet.

| Component | Description |
|---|---|
| `QueueCard` | Approved queue item — dance name, song, drag handle, approve/skip/remove actions |
| `PendingCard` | Pending request card — requester info, inline edit for custom requests, approve action |
| `SortableQueueItem` | dnd-kit sortable wrapper; provides `setNodeRef`, `transform`, and `isDragging` to its child |
| `RemoteControl` | Play/pause/skip control strip with `CountdownTimer` embedded |
| `CountdownTimer` | Displays remaining time, derived live from `playStartedAt + duration_ms` |
| `SessionsPanel` | Session list with expand/collapse; loads played track list lazily per session |
| `CustomEditModal` | Modal for editing dance name, difficulty, partner style, and song on custom requests |
| `SpotifyComponents` | `SpotifyPanel` (playback display + controls) and `SpotifySearch` (track search + add) |
| `utils.js` | Shared helpers: `formatDuration`, `formatTimestamp`, `timeAgo`, `diffColor`, `DIFFICULTIES`, `PARTNER_STYLES` |

### `components/BeatTipper/` and `components/BeatBooster/`

Beat tipping UI used on the attendee request form. `BeatTipper` is embedded in the submission form; `BeatBooster` is the quick-tip modal on existing requests.

---

## Key Libraries

### `lib/client/dj/controllerAdapters.js`
Adapter pattern for music source plugins. Interface: `{ id, shouldAutoAdvance(playing), playingStamps() }`.

- `StandardAdapter` — timer-based; calls `shouldAutoAdvance` when countdown reaches zero; stamps `advancedBy: 'standard'`
- `SpotifyAdapter` — Spotify playback polling owns advancement; stamps `advancedBy: 'spotify'`

Adding a new integration = implement those three members. No changes to existing adapters.

### `lib/client/dj/fairnessScore.js`
Weighted fairness scoring for the pending panel.

```
weight(client) = 1 / (1 + playsThisSession)
score(dance)   = Σ weight(requester) + tipCents / 100
```

Optional time decay (`weightDecayEnabled`): plays older than N minutes count less. System clients (`dj`, `spotify`) are excluded.

### `lib/client/dj/pendingGroups.js`
Groups pending requests by dance (and song-swap variant), hides dances already in queue, and attaches score + total tip cents to each group.

### `lib/server/dj/requestLogic.js`
Request creation and sibling marking. When a request is marked played, this module finds all other requests for the same dance and marks matching siblings played too. Original plays only mark non-swap siblings; swap plays only mark siblings with the same swap song. Prevents Electric Slide (original) from wiping out Electric Slide + Boots On requests.

### `lib/client/dj/plugins/useSpotifyPlugin.js`
React hook that encapsulates all Spotify logic for the controller. Handles the polling loop, track-change detection (URI diff between polls), auto-advance, pre-queuing the next track 5 seconds before the current one ends, and all playback controls (play, pause, next, previous, seek). Returns `{ connected, data, error, handleControl, handleAdd, onStartQueue, onCloseSession, retry }` — the controller page calls this hook and passes the result down to `SpotifyComponents`.

### `lib/client/dj/requests.js`
Thin fetch helpers used by controller components: `patch(id, body)` and `del(id)`. Centralises the `PATCH /api/dj/requests/[id]` and `DELETE` calls so components don't inline raw `fetch` calls.

### `lib/client/dj/autoAdvance.js`
Countdown timer that calculates `remainingMs` from `playStartedAt + duration_ms - pausedDuration`. Used by both the controller and the feed page to keep their timers in sync.

### `lib/beats/packages.js`
Beat purchase tier definitions (prices, base beats, bonus beats).

### `lib/messages/templates.js`
Pre-built DJ announcement templates (e.g. "Last song before break", "Requests open").

---

## Environment Variables

```bash
# App
NEXT_PUBLIC_BASE_URL=http://localhost:4000
NEXT_PUBLIC_PAYMENTS_ENABLED=true          # enables beat shop + tips UI

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...

# MongoDB
MONGODB_URI=mongodb+srv://...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Spotify
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
```

Spotify tokens are held in memory; they reset on server restart. Use `stripe listen --forward-to localhost:4000/api/beats/webhook` during development.

---

## Running Locally

```bash
pnpm install
pnpm dev          # starts on http://localhost:4000
```

For Stripe webhooks in dev:

```bash
stripe listen --forward-to localhost:4000/api/beats/webhook
```

---

## Tests

```bash
pnpm test
```

Jest with `testEnvironment: 'node'`, no transpiler (pure CJS). All test files live in `__tests__/` and use `require()`. Mock at `__tests__/__mocks__/mongodb.js`.

Test coverage:

| File | What it covers |
|---|---|
| `api.dj.requests.test.js` | Request creation, sibling marking via API |
| `autoAdvance.test.js` | Countdown timer / remaining-ms logic |
| `availableDances.test.js` | Dance list filtering |
| `controllerAdapters.test.js` | Standard/Spotify adapter stamp generation |
| `fairnessScore.test.js` | Weighted scoring + time decay |
| `pendingGroups.test.js` | Grouping, sorting, queue-hiding |
| `markSiblingsPlayed.test.js` | Sibling mark logic (original vs swap) |

---

## Architecture Notes

**Single-tenant for now.** All sessions belong to the DJ running the app. `ownerId` is present on all collections; multi-tenant (Phase 2) is already implemented.

**Two databases on the same cluster.**  
- `bld` — all DJ session and request data  
- `ldco` — shared dance catalogue, managed externally; this app treats it as read-only

**No per-DJ dance library.** The `ldco` catalogue is DJ-agnostic. Every DJ sees the same dances. Custom requests (freeform name + song) bypass the catalogue entirely.

**Beat currency.** 1 Beat has a $0.05 face value to the DJ. The DJ receives 90% of a beat tip's face value. The exchange rate is never shown in the UI — the UI shows beats only.

**Session slug.** Every session has a URL-safe slug (e.g. `friday-night-may-9`). The public feed and request pages resolve sessions by slug so QR code URLs stay stable between events.

**Roadmap.** Phase 3 adds Stripe tipping flows and attendee Clerk auth. Phase 4 adds subscription billing and gates controller adapters by tier.
