# Improvement Items

Ideas and planned follow-ups that aren't built yet. Specs in `specs/` describe how things work today; this file is the place for what we might do next. Move an item into its spec once it ships, and remove it from here.

Each item shows its **status**: _planned_ (decided, waiting to be built), _idea_ (worth reviewing, not decided), or _parked_ (decided against for now, with the reason).

---

## Controller

### Phone controller: Local Files from the phone — _planned_
The music folder lives in the playing computer's browser, so the phone can't yet:
- see which file each queued request will play, or fix a missing one (Find file / Accept)
- trigger **Fade → Next** or **Fade out**
- edit the Start/Fade points, or **Save to track**

These need the playing computer and the phone to share that information through the server: the computer would publish per-request match status (owner-only), and a small command channel would carry fades. Tempo, volume and the transport already work from the phone.

**Open question:** publish match status and file names to the server (owner-only), or keep everything laptop-only and accept these gaps? See `specs/mobile-controller.md`.

### Controller reorganisation — _idea_
Stephen has some changes in mind for the controller's organisation and other UI, but wants to use the current layout at a few events before deciding.

---

## Requests and fairness

### Re-weight requesters when their request is queued — _planned_ (2026-10-05)
Today a requester's weight (`lib/client/dj/fairnessScore.js`) only drops when one of their dances **plays**: `1 / (1 + plays_this_session)`. Many requests at once therefore each carry a full-strength vote until the first one plays.

Stephen's plan: when the DJ **queues** one of a requester's requests, re-evaluate their weight on everything else they've asked for, so they don't keep crowding out people who haven't been served yet.

This matters more now that dancers can request several favorites at once.

### Per-requester limit on active requests — _idea_ (2026-10-05)
A Session Setting, **off by default**, capping how many active (pending or queued) requests one person can have, e.g. off / 5 / 10. Requests must not be changed or batched: the DJ already has a "by requester" view.

**Open question:** what happens when the DJ turns the limit on, or lowers it, mid-event, and some requesters are already over it? Options:
- leave existing requests alone and block only new ones until they're under the limit
- ask the requester to choose which to drop
- let the DJ trim from the by-requester view

## Local Files playback

### Timeline handle hints — _planned_
When a timeline handle is on the "wrong side" of the playhead, say what will happen instead of acting:
- A Start point ahead of the playhead: "Ahead of the playhead — Restart to jump there."
- A Fade point behind it: "Already passed — applies next time."

Decided rule: setting a handle never moves the live audio; only the transport does.

### Music under comments — _idea_ (2026-10-04)
An in-queue comment currently holds silence for its duration (3 minutes if none is set). Instead, play something: a built-in "elevator music" loop, or a track the DJ picks (for one comment, or as a default in settings). It should fade in and out like any other track and play quieter than the set.

Background: comments used to be matched to files by their text, so a "Last Dance" comment played Donna Summer's "Last Dance". Comments now never match a file.

### Companion desktop app — _idea_ (2026-10-03)
A small installed app (e.g. Electron or Tauri) that plays the music instead of a browser tab. It would avoid the browser problems seen at the first live night:
- a tab reload stopping the music
- folder permission prompts after a restart
- autoplay rules
- other tabs' audio on the venue speakers
- the Chrome/Edge-only APIs

The open question is keeping it in sync. The app would follow the queue in the database the same way the browser player does (the queue is already the source of truth), with the web controller and phone remotes unchanged. Weigh this against how well the browser fixes from 2026-10-04 hold up: the reload guard, bigger audio buffers, songs read into memory, and the audio correcting the queue's clock.

---

## Feed and live updates

### Faster feed polling — _idea_ (2026-10-04)
The feed was lagging the controller by up to a minute. The cause was an app-wide 60 s SWR `dedupingInterval`, which also slowed down `refreshInterval` polls. Since the fix (a 2 s app-wide window), the TV feed lags by 5 s at most. If that still feels slow during a set, poll the feed every 2–3 s instead: a one-line change at about the same cost.

### Push updates instead of polling — _parked_ (2026-10-04)
**What it would look like:** a hosted pub/sub service (Pusher Channels or Ably) used only as a "something changed" signal.
- After each write, API routes publish a ping with no data on a per-session channel.
- The TV feed, the controller and the phone remote subscribe, and refetch through the existing APIs, so nothing private goes through the third party.
- Polling stays as a 30–60 s safety net.
- Attendee phones keep polling; they only poll while the request page is on screen.

**Effort:** about 1–2 days.
- a `publish()` helper, called from about 10–12 write routes
- a `useLiveUpdates` browser hook
- tests and two env vars

Clients should wait about 200 ms after a signal before refetching, so a burst of writes (e.g. a drag-reorder) doesn't trigger several refetches.

**Why parked:** it saves almost no load. A few screens polling every 5 s is about 1,400 tiny requests an hour, and phones already poll only while in use. The only gain is speed: about 0.2 s instead of up to 5 s.

**Why not the alternatives:**
- Webhooks only go from server to server.
- Vercel can't hold WebSockets, and an event stream ties up a function per open screen.
- MongoDB change streams need an always-on server.

**Revisit if** something needs truly instant updates, e.g.:
- the TV countdown visibly out of step with the music
- the TV mirroring live tempo changes
- many concurrent venues making polling add up
