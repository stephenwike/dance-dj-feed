# Handoff: what the DJ Feed app now writes to `ldco`, for the instructor dashboard

**For:** the Line Dance Manager project.
**From:** the DJ Feed app (`line-dance-dj-feed`), branch `feat/dance-favorites`.
**Goal:** build the instructor dashboard's **student wishlists** view on data the DJ Feed app now records.

Both apps sign in through the same LDCO auth server, so a user's id is the same in both: the DJ Feed's `session.user.id` is the OAuth `sub`, which equals the manager's `users._id` / `userId`. Everything below is in the shared **`ldco`** database.

---

## 1. New: who dances with which host (written by DJ Feed, read by the manager)

A **host** is the DJ or instructor who runs an event in the DJ Feed app. `hostId` is their account id: the same id as `instructors.userId` when the host is an instructor in the manager.

### When a link is recorded
A signed-in dancer opens a host's live event on the DJ Feed requester page. Being on the page is the proof they were there. A host opening their own event isn't recorded; closed or old events aren't either.

### `session_attendance`: one document per dancer per event

```ts
{
  _id: string;          // new ObjectId().toString(), the manager's style
  sessionId: string;    // the DJ Feed event (djfeed.dj_sessions._id as a string)
  hostId: string;       // the event's host (account id)
  userId: string;       // the dancer (account id)
  firstSeenAt: Date;
  lastSeenAt: Date;
}
// indexes: unique (sessionId, userId); (hostId, lastSeenAt desc)
```

### `host_dancers`: one document per host and dancer, summarizing the above

```ts
{
  _id: string;
  hostId: string;
  userId: string;
  firstSeenAt: Date;    // earliest event with this host
  lastSeenAt: Date;     // latest event with this host
  sessionCount: number; // distinct events with this host
  lastSessionId: string;
}
// indexes: unique (hostId, userId); (userId)
```

**Rules the DJ Feed follows:**
- Reloading only moves `lastSeenAt`.
- `sessionCount` counts each event once.
- Each host has their own row for the same dancer.

**Ownership:** the DJ Feed app writes these two collections. **The manager should only read them.** If the manager needs to write them too (e.g. links from venue check-ins), please coordinate so the document shape and rules above stay the same in both apps.

**Not in the DJ Feed, by design:** no privacy settings, no time filtering, no venue association. Stephen decided those belong in the manager:
- **Anonymity:** handle it on the instructor side.
- **Recent dancers only** (e.g. the last 90 days): filter on `host_dancers.lastSeenAt` or `session_attendance.lastSeenAt`.
- **Linking to venues:** the manager's job (DJ Feed events aren't tied to a venue yet).

---

## 2. Changed: dancers now set marks from the DJ Feed app too

The DJ Feed's requester page now reads and writes the manager's **existing** mark collections directly, in the manager's existing document shape: `{ _id: string, userId, danceId, createdAt: Date }`. Nothing new is needed in the manager to display them; they show up in its existing views on the next load.

| Collection | What the DJ Feed does |
|---|---|
| `user_favorite_dances` | ♥ on any catalog dance. Add or remove. |
| `user_flagged_dances` (Wishlist) | ⚑ on any catalog dance, plus a Wishlist panel with **Learned** and **Remove**. |
| `user_known_dances` | Added by **Learned** (if missing). |
| `user_refresh_dances` | Added when a dancer wishlists a dance they already **know**; removed by **Learned**. |

**Rules the DJ Feed applies:**
1. **Learned** = remove from `user_flagged_dances`, add to `user_known_dances` if it isn't there, remove from `user_refresh_dances`.
2. **Wishlisting a dance the user already knows** also adds it to `user_refresh_dances`. This matches the manager's model, where refresh implies known.
3. **Writes are idempotent:** marks are upserted on `{ userId, danceId }`, so double taps never create duplicates. Only dances that exist in `ldco.dances` can be marked.

If the manager has (or adds) its own Learned or wishlist behavior, please keep it consistent with rules 1 and 2, or tell us what the manager does so the DJ Feed can match it.

**Legacy data to be aware of:** some older mark documents have an `ObjectId` `_id` and a **string** `createdAt`. New ones from both apps use string `_id` and `Date` `createdAt`.

---

## 3. Building "My students' wishlists"

For the signed-in instructor (their account id = `hostId`):

```js
db.host_dancers.aggregate([
  { $match: { hostId: me /* , lastSeenAt: { $gte: since } — optional */ } },
  { $lookup: {
      from: 'user_flagged_dances',
      localField: 'userId',
      foreignField: 'userId',
      as: 'wishes',
  } },
  { $unwind: '$wishes' },
  { $group: {
      _id: '$wishes.danceId',
      students: { $addToSet: '$userId' },
      count: { $sum: 1 },
  } },
  { $sort: { count: -1 } },
  { $lookup: { from: 'dances', localField: '_id', foreignField: '_id', as: 'dance' } },
  { $unwind: '$dance' },
  { $project: { danceId: '$_id', danceName: '$dance.danceName', difficulty: '$dance.difficulty', count: 1, students: 1 } },
])
```

**Results:**
- **Per dance:** "Tush Push: 6 students". Show names, or keep it anonymous (counts only), as the manager decides.
- **Refresh vs learn:** join `user_refresh_dances` the same way to split wishlisted dances into "want to learn" and "want a refresher" (refresh = they know it and wishlisted it again).
- **Per student:** group by `userId` instead of `danceId`.
- **Recent students only:** add a `lastSeenAt` filter on `host_dancers`.
- **A specific event:** use `session_attendance` filtered by `sessionId` in place of `host_dancers`.

---

## 4. Other data the DJ Feed added (not in `ldco`)

These live in the DJ Feed's own database (`djfeed`), and the manager doesn't need them:
- **Favorite partner-dance songs** in `djfeed.dancer_favorite_songs`, keyed by a music-catalog id, not an `ldco` dance. The manager is line-dance-only.

---

## 5. Security note about existing manager routes

The manager's mark routes (`/api/users/dance/{favorite,flagged,known,refresh}/{add,remove}`) take `userId` from the request body without checking who's signed in, so anyone could change anyone's marks. The DJ Feed doesn't use these routes; it writes to the database itself after its own sign-in check. These routes should verify that the signed-in user matches `userId`. Any new dashboard routes should check that the signed-in user is the `hostId` whose dancers they're reading.

---

## Where to look in the DJ Feed repo

- `lib/server/ldco/hostDancers.js`: live linking (`recordAttendance`) and indexes.
- `lib/server/ldco/danceMarks.js`: favorite, wishlist, known and refresh writes, and the Learned and refresh rules.
- `specs/dance-marks.md`: the full behavior.
