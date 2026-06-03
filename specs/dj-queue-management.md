# Workflow: DJ Queue Management (Standard Mode)

**Actor:** DJ (Clerk-authenticated)  
**Entry point:** `/dj-controller`  
**Outcome:** The DJ curates a live queue, plays tracks in order, and manages the session until it ends.

---

## Preconditions

- An active session exists (`status: 'active'`)
- Session `plugin` is `'standard'`
- Attendees may have already submitted requests

---

## Layout

Three columns, polled via SWR every 5 seconds:

| Column | Contents |
|---|---|
| **Left — Queue** | Now-playing card, approved upcoming tracks (drag-to-reorder), session history |
| **Center — Pending** | Requests grouped by dance, sorted by fairness score. Tabs: By Dance / By Requester |
| **Right — Controls** | Session toggles, message panel, navigation |

---

## Core Actions

### Approve a Request
1. DJ sees a pending dance group in the center panel (sorted by fairness score)
2. DJ clicks **Approve**
3. Client calls `PATCH /api/dj/requests/[id]` with `{ status: 'approved', queuePosition: <next> }`
4. Request moves from Pending to the Queue panel at the bottom of the approved list
5. The dance group disappears from Pending (hidden once in queue)

### Reorder the Queue
1. DJ drags an approved track up or down in the Queue panel
2. On drop, client calls `PATCH` on each affected request with updated `queuePosition` values
3. Queue re-renders in new order; feed page reflects order on next poll

### Play a Track
1. DJ clicks **Play** on the first queue item (or any approved item)
2. Client calls `PATCH /api/dj/requests/[id]` with `{ status: 'playing', playStartedAt: now, ...adapter.playingStamps() }`
3. `advancedBy: 'standard'` is stamped on the request
4. Now-playing card appears in the Queue column header
5. Auto-advance countdown starts, counting down from `duration_ms`

### Auto-Advance (Standard Mode)
1. `autoAdvance.js` calculates `remainingMs = playStartedAt + duration_ms - now - pausedDuration`
2. When `remainingMs <= 0`, the adapter fires `shouldAutoAdvance(playing)` → `true`
3. Controller:
   - Marks current request `status: 'played'`; triggers sibling marking (see below)
   - Marks next approved request `status: 'playing'`
   - Resets countdown for new track duration

### Pause / Resume a Track
1. DJ clicks **Pause** — client PATCHes `{ pausedAt: now }`
2. DJ clicks **Resume** — client PATCHes `{ pausedAt: null }`, adds elapsed to pause total
3. Countdown timer respects `pausedAt` so it freezes during pause

### Skip a Track
1. DJ clicks **Skip** on a playing or pending request
2. Client calls `PATCH /api/dj/requests/[id]` with `{ status: 'skipped' }`
3. Request moves to history; next approved track becomes first in queue

### Remove a Request
1. DJ clicks **Remove** (trash icon) on any request
2. Client calls `DELETE /api/dj/requests/[id]`
3. Request removed from all panels

### Sibling Marking (Auto-mark family as played)
When a request is marked `played`:
- Server finds all other requests in the session for the same dance
- If the played request is the **original song**: siblings without a song swap are marked `played`
- If the played request is a **song swap**: siblings with the same swap song are marked `played`
- Effect: playing Electric Slide marks all Electric Slide requests played; playing Electric Slide + Boots On only marks that swap variant played

---

## Pending Panel Scoring

Requests are grouped by dance and sorted descending by fairness score.

```
weight(attendee) = 1 / (1 + plays_this_session)
score(dance)     = Σ weight(requester) + tipCents / 100
```

- An attendee who hasn't danced yet has weight 1.0
- After 1 dance played: weight 0.5; after 3: weight 0.25
- Beat tips add a flat bonus (`tipCents / 100`) to the group score
- **Weight decay** (optional session toggle): plays older than N minutes fade toward zero

---

## Session Settings (Right Panel)

| Toggle | Effect |
|---|---|
| Partner dances enabled | Shows/hides partner dance requests in the pending panel |
| Tipping enabled | Controls whether the beat tip UI is shown on the request form |
| Weight decay | Enables time-based decay on play history weights |
| Half-life (minutes) | Configures decay rate when weight decay is on |

Settings are saved immediately via `PATCH /api/dj/sessions/[id]`.

---

## Announcements

1. DJ types a message or selects a template in the Right panel
2. Chooses type: **Urgent** (full-screen overlay on feed) or **In-Queue** (smaller persistent banner)
3. Optionally sets a display duration
4. Client calls `POST /api/dj/messages`
5. Feed page picks it up within 3 seconds
6. DJ can dismiss the message manually via `PATCH /api/dj/messages/[id]`

---

## End Session

1. DJ clicks **End Session**
2. Client calls `PATCH /api/dj/sessions/[id]` with `{ status: 'closed' }`
3. Request form shows "Session has ended" to attendees
4. Feed shows no active session

---

## Error States

| Condition | Behavior |
|---|---|
| Not signed in | Redirected to sign-in |
| No active session | Redirected to `/start` |
| PATCH fails | Optimistic update rolled back; error toast shown |
| Poll fails | SWR retries; stale data shown with indicator |
