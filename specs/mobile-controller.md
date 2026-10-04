# Phone Controller

**Actor:** the host/DJ, on their phone, often away from the DJ station.
**Goal:** run the whole event from the phone. A problem should never force a run back to the computer.
**Code:** `components/dj-controller/mobile/`, sharing all state with the desktop layout through `components/dj-controller/useController.js`.

---

## When it's used

Screens 768px wide or narrower get the phone layout automatically (`pages/dj-controller/index.js`).
- **More → Use the desktop layout** switches; the choice is remembered on that device.
- On a narrow screen in the desktop layout, a **📱 Phone layout** button switches back.

Both layouts render from the same `useController()` state, so they can't disagree about the event. Only what's on screen differs.

## Structure

| Area | Contents |
|---|---|
| **Header** | Session name, live status and time left (tap → session sheet). 🔔 tips and notifications with an unread badge |
| **Alerts** (under the header) | Session ending soon / time up (with **Extend**), requests paused (with **Resume**), the dev Stripe-listener warning |
| **Live** tab (home) | What's playing, countdown, big restart / −10s / pause-resume / +10s / skip buttons, the playback plugin's `remoteControls` (Local Files: tempo and volume), quick actions (**Announce**, **Add to queue**, **Requests on/paused**), up next |
| **Queue** tab | One card per queued dance: position, name, song, ETA, requesters, beats, and a red "No file" or amber tint from the plugin's `itemTone`. Tapping opens a sheet with the plugin's `queueItem` UI and **Play next**, **Play last**, **Edit**, **Back to requests**, **Mark played**, **Remove**. **Add to queue** and **Start queue** sit at the top |
| **Requests** tab | Pending requests by dance or by requester, filter and sort (`PendingRequests`, shared with desktop) |
| **People** tab | Requesters: stats, messages, gift beats, suppress (`RequestersPanel`) |
| **More** tab | Announcements, Add to queue, Tips & notifications, Played so far · Session settings (incl. music source), Feed display, Sessions, Wallet · Desktop layout, Sign out |
| **Session sheet** | Switch between live sessions/drafts, Extend, Go live (draft), Session settings, End session (confirm), Discard draft (confirm), New session, All sessions |

Sub-pages reuse the desktop panels full-screen, so behaviour is identical on both layouts. The phone's **Back** button closes the open page or sheet rather than leaving the controller.

## Design decisions

- **Live is home.** On the floor the DJ needs what's playing, the transport, tempo/volume and a way to announce.
- **Press and hold to drag.** A card is picked up after a 350 ms hold without moving (dnd-kit `TouchSensor`/`MouseSensor` with a delay), so a quick swipe still scrolls the list and a tap still opens the card's sheet. Dropping uses the desktop's `useQueueReorder.handleDragEnd`, with the same optimistic, debounced save.
- **Destructive actions confirm:** ending a session, discarding a draft.
- **Feed display** keeps template and screen-shape switching. The visual Feed Editor is a computer task, and the page says so.
- **The plugin overlay** ("use Chrome or Edge") is not shown on phones: a phone is a remote by nature.

## Phase 2 — Local Files from the phone (planned)

The music folder lives in the computer's browser, so a phone can't yet:
- see which file each queued request will play, or fix a missing one (Find file / Accept)
- trigger **Fade → Next** or **Fade out**
- edit the Start/Fade points, or **Save to track**

These need the playing computer and the phone to share that information through the server (e.g. the computer publishing match status per request, and a small command channel for fades). Tempo, volume and all transport already work from the phone.
