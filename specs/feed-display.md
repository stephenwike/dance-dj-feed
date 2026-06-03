# Workflow: Feed Display (TV / Projector)

**Actor:** Passive display (no user interaction) — viewed by attendees in the room  
**Entry point:** `/dj-feed` or `/feed/[slug]`  
**Outcome:** Attendees can see what's playing now, what's coming up, and the QR code to submit requests.

---

## Preconditions

- An active DJ session exists
- The feed URL is open in a browser on a TV or projector connected device
- No authentication required

---

## Page Composition

The feed page has four main areas:

### 1. QR Code
- Displays a QR code pointing at `/dj-request` (or `/request/[slug]`)
- Static — does not change during a session
- Attendees scan this to open the request form on their phone

### 2. Now Playing Card
- Shows the dance name, song name, artist, and difficulty level
- Color-coded by difficulty:
  - Beginner — green
  - Intermediate — blue
  - Advanced — red
  - (other levels — neutral)
- If the playing request is a **song swap**, an amber `↻ SONG SWAP` chip is shown in the header and an amber `↪ [Song Name]` subtitle appears below the dance name
- If no track is currently playing, the card shows an idle state

### 3. Auto-Advance Timer
- Mirrors the controller's countdown timer
- Derives `remainingMs` from the same formula: `playStartedAt + duration_ms - now - pausedDuration`
- Shows remaining time as a progress bar or countdown
- Pauses when `pausedAt` is set

### 4. Up Next List
- Shows the next 4 approved (queued) tracks in order
- Each item displays dance name, song name, and estimated start time
- Song swap items show the amber `↪ [Song Name]` row below the dance name
- Estimated times accumulate from the current track's remaining time + durations of items ahead

---

## Data Polling

| Data | Endpoint | Interval |
|---|---|---|
| Requests (playing + queue) | `GET /api/dj/requests` | Every 5 seconds |
| Messages (DJ announcements) | `GET /api/dj/messages` | Every 3 seconds |

The page uses SWR with short `refreshInterval` values. No user interaction triggers refreshes.

---

## DJ Announcements

When the DJ posts an announcement via the controller:

**Urgent message:**
- Full-screen overlay appears on the feed
- Large text, high contrast
- If `duration` is set, a countdown is shown; message auto-dismisses when it expires
- DJ can also dismiss manually from the controller

**In-queue message:**
- Smaller persistent banner (below the now-playing card or in a fixed strip)
- Stays until dismissed by the DJ or expired

---

## Slug-Based Feed (`/feed/[slug]`)

- Server-side: resolves session by `slug` from `dj_sessions`
- Props pass `sessionId` and `djId` to the page component
- Otherwise identical to `/dj-feed`
- Shareable and stable — the same URL works every time the DJ uses the same session name pattern

---

## Visual States

| State | Display |
|---|---|
| Session active, track playing | Now-playing card + timer + queue |
| Session active, no track playing | Idle now-playing card ("Warming up...") + queue |
| Session active, DJ paused | Timer frozen; now-playing card still shown |
| Session ended | "Session has ended" overlay |
| No active session | "No active session" message |
| Urgent announcement | Full-screen overlay on top of everything |

---

## Notes

- The feed is designed to run unattended; no interaction model beyond passive viewing
- The timer on the feed and the timer on the controller derive from the same stored `playStartedAt` + `duration_ms` fields, so they stay in sync naturally across devices
- The feed page does not require a Clerk session; it is fully public
