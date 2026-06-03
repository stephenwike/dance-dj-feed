# Workflow: Spotify-Integrated Queue Management

**Actor:** DJ (Clerk-authenticated, Spotify connected)  
**Entry point:** `/dj-spotify`  
**Outcome:** The DJ manages a live queue with Spotify handling actual track playback and auto-advancement.

---

## Preconditions

- An active session exists with `plugin: 'spotify'`
- Spotify OAuth has been completed (tokens stored in memory)
- A Spotify Premium account is active (required for playback API)

---

## How This Differs From Standard Mode

| Feature | Standard | Spotify |
|---|---|---|
| Track advancement | Timer countdown fires | Spotify polling detects track change |
| Playback control | DJ manually signals "playing" | Spotify controls are authoritative |
| Song URI | Optional | Required to queue in Spotify |
| Auto-queue next track | N/A | Queued ~5 seconds before current finishes |
| `advancedBy` stamp | `'standard'` | `'spotify'` |

---

## Spotify Connection Flow

1. DJ visits `/api/spotify/auth`
2. Redirected to Spotify OAuth consent screen
3. After approval, Spotify calls `/api/spotify/callback`
4. Tokens (`access_token`, `refresh_token`) stored in memory on the server
5. Controller page polls `GET /api/spotify/player` to confirm connection

---

## Playback Polling

The controller polls `GET /api/spotify/player` every 2 seconds when a track is playing.

The response includes:
- Current track URI + progress + duration
- Whether Spotify is playing or paused
- Spotify's internal queue

The `SpotifyAdapter.shouldAutoAdvance(playing)` method compares the current Spotify URI against the URI on the `playing` request. When they diverge (Spotify has moved on), the adapter returns `true` and the controller auto-advances.

---

## Core Actions

### Play a Track via Spotify

1. DJ approves a request — it enters the Queue column
2. DJ clicks **Play** on the first queue item
3. Client calls `PATCH /api/dj/requests/[id]` with `{ status: 'playing', playStartedAt: now, advancedBy: 'spotify' }`
4. If the request has a `spotifyUri`, the client calls `POST /api/spotify/player` to add it to Spotify's queue
5. Spotify begins playing the track
6. Polling detects the active track; controller holds in `playing` state

### Auto-Queue Next Track

When `remainingMs` on the current track falls below 5 seconds:
- Controller calls `POST /api/spotify/player` with the next approved track's `spotifyUri`
- Spotify queues the track so it plays seamlessly after the current one

### Detect Track Change (Auto-Advance)

1. Spotify finishes the track and advances internally
2. On next poll, `GET /api/spotify/player` returns a different `item.uri` than the current `playing` request's `spotifyUri`
3. `SpotifyAdapter.shouldAutoAdvance()` returns `true`
4. Controller marks current request `played` (triggers sibling marking)
5. Next approved request is marked `playing`
6. New track's URI is queued in Spotify

### Search Spotify

1. DJ types in the Spotify search box
2. Client calls `GET /api/spotify/search?q=...`
3. Results show track name, artist, album art, duration
4. DJ selects a track to add it directly to the queue (bypasses the pending panel; creates a request with `status: 'approved'`)

### Manual Controls

All manual controls call `PUT /api/spotify/player` with an action payload:

| Action | Payload |
|---|---|
| Play | `{ action: 'play' }` |
| Pause | `{ action: 'pause' }` |
| Next | `{ action: 'next' }` |
| Previous | `{ action: 'previous' }` |
| Seek | `{ action: 'seek', positionMs: N }` |

---

## Pending Panel

Identical to Standard mode. Same fairness scoring, grouping, and approve flow. The difference is that approving a request with a `spotifyUri` allows it to be queued in Spotify when played.

---

## Song Swap with Spotify

An attendee can request a dance to a different song than the catalogue default. If the swap song has a Spotify URI, that URI is stored on the request. The Spotify controller uses `swapSpotifyUri` when queuing the track.

---

## Token Refresh

Spotify access tokens expire after 1 hour. The server automatically refreshes them using the stored `refresh_token` before any API call that returns a 401. Tokens are held in memory and lost on server restart (requiring re-auth).

---

## Error States

| Condition | Behavior |
|---|---|
| Spotify not connected | Spotify panel shows "Connect Spotify" link |
| Token expired + no refresh token | Same "Connect" prompt |
| Spotify API error | Error displayed in panel; polling continues |
| Track has no `spotifyUri` | Play button works; no URI queued in Spotify (manual Spotify control needed) |
| Spotify Premium not active | Playback controls return 403; error shown |
