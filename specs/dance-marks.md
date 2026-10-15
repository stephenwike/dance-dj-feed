# Workflow: Favorites, Wishlist, Favorite Songs and Stepsheets on the Requester App

**Actor:** Attendee (dancer) on the requester app (`/request/[slug]`, `/dj-request`)
**Outcome:** From any line dance, the dancer can favorite it, add it to their wishlist, or open its stepsheet. Favorites and the wishlist are the same ones they keep in **Line Dance Manager**. From a partner dance, they can favorite its song.

---

## Where the icons appear

On every catalog dance in:
- **Queue** (now playing and up next) and **History**: in the row's **top-right corner**, with anything else the row shows on its right (Now Playing, beats, play time) underneath.
- **Requests**: on the **left of the status line** (under the song), with the status ("Requested 5 min ago", "In queue · ~1:00 PM") at its right end. The row's right side holds only the request controls:
  - **"+ 1"** on someone else's request: tap to add yours; the number is how many people want it.
  - **"✓ 2"** (filled) on yours: tap to withdraw, which asks first.
  - On yours, the **Beats coin** with your tip ("20", or "Tip"), which opens the booster.

  The controls have a fixed size, with the coin's space kept even when there's no coin, so every row lines up and the status always ends in the same place. With no original requests (only song swaps), the first swap row carries the icons.

| Icon | Meaning | Shown when |
|---|---|---|
| ♥ Heart | Favorite; red and filled when on | The request has a catalog `danceId` |
| ⚑ Flag | Wishlist (dances to learn); amber and filled when on | The request has a catalog `danceId` |
| 📄 Sheet | Opens the stepsheet in a new tab | The request has a `stepsheet`, or its catalog dance does |
| ♥ Heart (partner) | Favorite song; red and filled when on | A partner dance whose song was picked from the music catalog (`catalogTrackId`) |

Free-typed line dances and partner songs have no catalog id, so they get no heart. A partner song's heart sits in the same column as line dances' hearts. History lists each partner song separately (previously every partner dance collapsed into one "Partner Dance" row).

**Signed out:** the heart and flag still show. Tapping either opens **Save the dances you love** (sign in, or Not now); signing in returns to the same page. The stepsheet always works.

**Signed in:** a tap updates the icon at once and saves in the background. A toast confirms it at the bottom of the screen, e.g. "⚑ Tush Push added to your wishlist", "♥ Once You Love removed from your favorite songs". If saving fails, the icon goes back and the toast says it couldn't save.

---

## Requesting from favorites

On the request form, a signed-in dancer can request straight from their favorites:
- **Line Dance:** under the Dance search box while nothing is typed or picked: **♥ Request from your favorites (n)**.
- **Partner Dance:** at the top of the form: **♥ Request from your favorite songs (n)**.

**Closed by default**, the panel suggests **one favorite at random** that can be requested now ("How about Copperhead Road?"), with **🔀** for another and a one-tap **Request**. If none can be requested right now, it says so.

**Open**, it lists every favorite **8 per page** (‹ › with "9–16 of 312"). With more than a page there's a **Find in your favorites** box. It searches everything about a favorite (name, song, artist, difficulty, choreographers and its status tonight) word by word, as the main Dance search and the wishlist search do (`lib/client/dj/danceTextSearch.js`).

**Search order** (all three searches), best first:
1. **dance name**: starts with what was typed, then a word in it starts with it, then contains it
2. **song or artist**: the same three steps
3. **choreographer**: the same three steps
4. difficulty or status only
5. words spread over several fields

Ties keep the list's usual order. "fre" shows Freaky Skillz before Fred Whitehouse's dances. Ticks are kept across pages and searches.

**Stepsheets:** the suggestion and every favorite line dance link to the stepsheet (**📄**, opening in a new tab). In the list, dances without one keep an empty space so the buttons line up; favorite songs have none.

**Removing a favorite:** the suggestion and every row have a **🗑** button. It takes two taps: the first turns it into a red **Remove?**, and a second within 3 s removes it. The removal also applies in Line Dance Manager, and a toast confirms it ("A Day Late removed from your favorites"). Removed favorite songs work the same way.

Tick one, several, or **Select all (n)** (every requestable favorite, across all pages), then **Request n dances** (or songs). Each is sent as its own normal request, so the DJ's view is unchanged. Afterwards a toast says "Requested 3 dances from your favorites", or how many couldn't be sent.

Each favorite shows its status tonight (`lib/client/dancer/favoriteRequests.js`). Only available and join can be ticked:

| Status | Label | Ticked |
|---|---|---|
| available | — | sends a new request |
| join | "In queue · you’ll join it" / "2 requested · you’ll join it" | sends one more request for that dance; for a partner song, joins its group (`partnerGroupId`) |
| mine | "Requested by you" | can't tick |
| playing | "Playing now" | can't tick |
| played | "Played at 1:32 PM" | can't tick; the existing "no re-requesting what just played" rule (`filterAvailableDances`). Someone re-requesting it makes it joinable again |

The list is sorted available, join, mine, playing, played, then by title.

- **Signed out:** the Line Dance form shows **♥ Sign in to request from your favorite dances**, which opens the sign-in prompt.
- **The wishlist isn't part of requesting.** It tells instructors which dances people want to learn; the manager links users to their venues.
- **There's no limit on how many favorites one dancer can request** (a per-requester limit is in IMPROVEMENTS.md, as is re-weighting a requester when their request is queued).

## Your wishlist

The Line Dance form also has a **⚑ Your wishlist (n)** panel, under the favorites panel, closed by default. The wishlist is **not for requesting**: it tells instructors which dances people want to learn (the manager links dancers to their venues). So the panel only manages it (`components/dj-request/WishlistPanel.js`):
- It lists **8 per page** with ‹ ›, and has a **Find in your wishlist** box when the list is longer than a page (the same word-by-word search).
- **🎓 Learned:** takes the dance off the wishlist, marks it **known** (if it isn't already), and removes any **refresh** mark. Toast: "Absolutely marked as learned".
- **📄 Stepsheet**, between Learned and Remove: opens the dance's stepsheet in a new tab. Dances without one keep an empty space there, so the buttons line up.
- **🗑 Remove:** takes the dance off the wishlist only, with the two-tap "Remove?".
- A dance you already know and wishlisted again shows **Refresh**.

**Wishlisting a dance you already know**, from anywhere in the app (e.g. its ⚑ on a request row), also marks it **refresh**: you know it and want to brush up. This matches the manager, where "refresh" always comes with "known".

## Data: shared with Line Dance Manager

Both apps sign in through the same LDCO auth server, so `session.user.id` here (the OAuth `sub`) is the manager's `userId`. Marks live in the `ldco` database as one document per mark, in the manager's shape:

| Mark | Collection | Document |
|---|---|---|
| Favorite | `user_favorite_dances` | `{ _id: <ObjectId hex string>, userId, danceId, createdAt: Date }` |
| Wishlist | `user_flagged_dances` | same |
| Known | `user_known_dances` | same: set by **Learned** |
| Refresh | `user_refresh_dances` | same: set when a known dance is wishlisted again; cleared by **Learned** |

`lib/server/ldco/danceMarks.js`:
- reads marks with `distinct('danceId')`
- turns one on with an upsert, so a double tap never creates two documents
- turns one off by deleting the matching documents
- only marks dances that exist in `ldco.dances`

**The manager's process, confirmed:**
- Its add and remove routes (`/api/users/dance/{favorite,flagged}/{add,remove}`) insert or delete exactly one such document, with no other side effects.
- It builds a user's favorites and wishlist from these collections by `userId` (`core/handlers/users/get-user-by-id.ts`), as do its friends-activity and acquaintance views.

So a dance marked here appears as marked in the manager on its next load.

## Favorite songs (partner dances)

The manager is a line-dance tool, so partner favorites stay in this app. `lib/server/dancer/favoriteSongs.js` keeps one document per favorite in **`djfeed.dancer_favorite_songs`**: `{ _id, userId, trackId, createdAt }`.
- `trackId` is the music catalog id (`music_catalog.tracks._id`, e.g. `musicbrainz:<recording MBID>`), the same value requests store as `catalogTrackId`.
- `userId` is the same shared account id.
- Only songs in the catalog can be favorited.
- Title and artist come from the catalog when shown.

Style isn't part of the favorite. A song can be danced to several styles, and a song-to-style association may come later as its own collection.

A favorite is one MusicBrainz recording, so favoriting the album version doesn't mark a remix.

## Which dancers dance with which hosts

So instructors can see what *their* dancers want to learn, this app records which dancers dance with which hosts. Line Dance Manager uses it: filtering (e.g. the last 90 days), anonymity on the instructor side, and venue links are all the manager's job. This app only records the facts (`lib/server/ldco/hostDancers.js`).

**When it's recorded:** a signed-in dancer opens a host's **live** event on the requester app. Being on the page proves they were there. The page calls `POST /api/dancer/attend { sessionId }` once per load. A host opening their own event isn't recorded, and neither are closed or old events.

Both collections are in the shared **`ldco`** database, keyed by the shared account ids (the host is the session's `ownerId`), in the manager's style (string `_id`, `Date` timestamps):

| Collection | One per | Fields | Indexes |
|---|---|---|---|
| `session_attendance` | dancer per event | `{ _id, sessionId, hostId, userId, firstSeenAt, lastSeenAt }` | unique `(sessionId, userId)`; `(hostId, lastSeenAt)` |
| `host_dancers` | host and dancer | `{ _id, hostId, userId, firstSeenAt, lastSeenAt, sessionCount, lastSessionId }` | unique `(hostId, userId)`; `(userId)` |

Reloading only moves `lastSeenAt`; `sessionCount` counts each event once. The indexes are created the first time the endpoint is used.

### Linking dancers from past events

For events from before live links, a host can link dancers after the fact on **Link past dancers** (`/dj-link-dancers`, linked from Your events → Recent events). The logic is in `lib/server/dj/dancerLinks.js` and the API is `/api/dj/dancer-links`.
1. **Choose events:** the host's own closed events, each showing its date, how many signed-in dancers and guests requested there, and how many are already linked. Events with no signed-in dancers can't be ticked. **Select all** is available.
2. **Find dancers:** the signed-in dancers who requested at those events, with name and email (from `user_profiles`), how many of the events they were at, and **Linked** if already linked. All are ticked by default.
3. **Link n dancers:** writes the same `session_attendance` and `host_dancers` records as live links, dated to the dancer's first request at each event. Dates only widen (first seen keeps the earliest, last seen the latest), and each event counts once, so running it again changes nothing.

**Where the data comes from:** each past event's `requester_history` (written when it closed: one entry per requester per event). A signed-in dancer's requester id is their account id; guests ("anon_…") can't be linked, and the page says how many there were. Page visits weren't recorded before live links, so only dancers who made a request are found. Events closed before `requester_history` existed won't show any dancers. A host can only link from their own events, and never links themselves.

**For the manager:** "what my dancers want to learn" is `host_dancers` (hostId = the instructor's account id) joined to `user_flagged_dances` by `userId`, grouped by `danceId`.

## API

| Method | Route | Body | Result |
|---|---|---|---|
| `GET` | `/api/dancer/marks` | — | `{ favorite: [danceId], wishlist: [danceId], song: [trackId], songs: [{ id, title, artist, durationMs }] }` (songs: favorite songs with details, newest first, for requesting) |
| `POST` | `/api/dancer/marks` | `{ danceId, kind: 'favorite' \| 'wishlist', on }` | `{ danceId, kind, on, refresh? }`; `404` for a dance not in the catalog. Wishlisting a known dance also marks it refresh |
| `POST` | `/api/dancer/marks` | `{ danceId, kind: 'learned' }` | `{ danceId, learned: true }`: off the wishlist, known, no refresh |
| `POST` | `/api/dancer/marks` | `{ trackId, kind: 'song', on }` | `{ trackId, kind, on }`; `404` for a song not in the catalog |

| `GET` | `/api/dj/dancer-links` | — | `{ sessions: [{ id, name, date, dancers, guests, linked }] }`: the host's past events |
| `POST` | `/api/dj/dancer-links` | `{ action: 'preview', sessionIds }` | `{ dancers: [{ userId, name, email, sessions, linked }], guests }` |
| `POST` | `/api/dj/dancer-links` | `{ action: 'link', sessionIds, userIds }` | `{ dancers, newLinks, events }` |
| `POST` | `/api/dancer/attend` | `{ sessionId }` | `{ recorded, firstVisit }`: links the dancer to the live event's host; `404` if the event isn't live |

All require sign-in (`401` otherwise). The client is `lib/client/dancer/useDanceMarks.js` and the UI is `components/dj-request/DanceMarks.js`.

## Not yet

- A song-to-style association (its own collection), if partner style input is dropped from requests.
- Collections (`dance_collections`).
- Using marks elsewhere, e.g. surfacing favorites when searching for a dance to request, or showing the DJ which queued dances the room has favorited.
