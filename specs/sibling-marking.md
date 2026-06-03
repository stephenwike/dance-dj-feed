# Workflow: Sibling Marking (Auto-mark Related Requests as Played)

**Context:** Internal system — triggered automatically when a request is marked `played`  
**Relevant files:** `lib/server/dj/requestLogic.js`, `pages/api/dj/requests/[id].js`  
**Outcome:** When one version of a dance is played, all equivalent pending requests are automatically marked played too — preventing the DJ from having to clean them up manually.

---

## The Problem

Multiple attendees can request the same dance. Without sibling marking:
- 5 people request Electric Slide
- DJ plays Electric Slide once
- 4 more Electric Slide requests remain in Pending as if the dance hasn't been played

Additionally, song swaps complicate this:
- Some attendees want Electric Slide to "Electric Boogie" (default song)
- Some attendees want Electric Slide to "Boots On" (song swap)

Playing the original should NOT wipe out the swap requests — the attendees wanted a specific version the DJ hasn't played yet.

---

## Sibling Matching Rules

When request R is marked `played`:

### If R is an original (non-swap) request:
Find all other requests where:
- Same dance: `danceId` matches OR `danceName` matches (case-insensitive)
- `isSongSwap: false` (or `false`/absent)
- `status` in `['pending', 'approved', 'skipped']`
- Same `sessionId`

Mark those siblings `status: 'played'`.

**Does NOT touch swap variants of the same dance.**

### If R is a song swap request:
Find all other requests where:
- Same dance: `danceId` matches OR `danceName` matches
- `isSongSwap: true`
- `swapSongName` matches R's `swapSongName` (case-insensitive)
- `status` in `['pending', 'approved', 'skipped']`
- Same `sessionId`

Mark those siblings `status: 'played'`.

**Does NOT touch other swap variants with a different swap song.**

---

## Example

| Request | Dance | Swap? | Swap Song | Status |
|---|---|---|---|---|
| A | Electric Slide | No | — | playing |
| B | Electric Slide | No | — | pending |
| C | Electric Slide | Yes | Boots On | pending |
| D | Electric Slide | Yes | Electric Boogie | pending |

When A is marked `played`:
- B is marked `played` (same dance, not a swap) ✓
- C remains `pending` (swap variant — not touched) ✓
- D remains `pending` (different swap — not touched) ✓

When C is marked `played`:
- D remains `pending` (different swap song) ✓
- B remains unchanged ✓

---

## Implementation

`buildSiblingDanceMatch(thisReq)` in `requestLogic.js` returns a MongoDB filter:

```js
{
  sessionId: thisReq.sessionId,
  _id: { $ne: thisReq._id },
  status: { $in: ['pending', 'approved', 'skipped'] },
  // dance match:
  $or: [
    { danceId: thisReq.danceId },
    { danceName: { $regex: new RegExp('^' + escapedName + '$', 'i') } }
  ],
  // swap filter:
  isSongSwap: thisReq.isSongSwap,
  // if swap: also match on swapSongName
  ...(thisReq.isSongSwap ? {
    swapSongName: { $regex: new RegExp('^' + escapedSwap + '$', 'i') }
  } : {})
}
```

The PATCH handler for `status: 'played'` calls `updateMany` with this filter after updating the primary request.

---

## When It Fires

- Triggered by `PATCH /api/dj/requests/[id]` when `{ status: 'played' }` is in the body
- Also fires on auto-advance (both Standard and Spotify adapters ultimately call the same PATCH endpoint)
- Does **not** fire for `skipped` status changes

---

## Tests

`__tests__/markSiblingsPlayed.test.js` and `__tests__/api.dj.requests.test.js` cover:
- Original marks only non-swap siblings
- Swap marks only same-swap siblings
- Different swap variants are not affected
- Siblings with `status: 'played'` already are not re-updated
