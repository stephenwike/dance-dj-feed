# Workflow: Fairness Scoring and Pending Panel

**Context:** Internal system — no direct user workflow, but it drives what the DJ sees in the Pending panel  
**Relevant files:** `lib/client/dj/fairnessScore.js`, `lib/client/dj/pendingGroups.js`  
**Outcome:** The pending panel shows dance groups ordered by fairness score so the DJ can see which dances have the broadest demand.

---

## Purpose

Without fairness scoring, the pending panel would just be a flat list in submission order. Scoring ensures that:
- Dances with many different attendees requesting them rank above dances that one person requested multiple times
- Attendees who have danced less recently get higher weight (their requests count more)
- Beat tips provide a way to boost a dance's priority

---

## Scoring Formula

### Step 1 — Build plays-per-client

For each attendee (`clientId`), count how many dances they've had played this session.

If **weight decay is enabled**:
```
weight(play) = (0.5) ^ ((now - playStartedAt) / halfLifeMs)
```
A play from 1 half-life ago counts as 0.5; from 2 half-lives ago, 0.25; etc.

If **weight decay is disabled**, each play counts as 1.

System clients (`'dj'`, `'spotify'`) are excluded from this calculation.

### Step 2 — Compute per-attendee weight

```
weight(attendee) = 1 / (1 + playsThisSession)
```

An attendee who hasn't danced yet: `weight = 1 / (1+0) = 1.0`  
After 1 dance: `weight = 0.5`  
After 3 dances: `weight = 0.25`

With decay enabled, `playsThisSession` is the sum of decayed play weights, not a raw count.

### Step 3 — Score a dance group

```
score(dance) = Σ weight(each requester) + tipCents / 100
```

- Sums the weight of every attendee who has a pending request for this dance
- Adds `tipCents / 100` as a flat bonus (a 50¢ tip in beats = +0.5 to score)

---

## Pending Groups

`buildPendingGroups(pending, queue, lastPlayedAt, playsPerClient)` in `pendingGroups.js`:

1. Takes all `status: 'pending'` requests
2. Groups by compound key: `danceId + isSongSwap + swapSongName`
   - Electric Slide (original) and Electric Slide + Boots On are **separate groups**
3. Filters out groups where the same variant is already in the queue (`status: 'approved'`)
   - Prevents the DJ from approving something already approved
4. Attaches `score` and `totalTipCents` to each group
5. Sorts groups descending by `score`

The resulting list is what's rendered in the **By Dance** tab of the pending panel.

---

## By Requester Tab

An alternative view groups pending requests by attendee (`clientId`), showing how many requests each person has pending. Sorted by the attendee with the highest total tip contribution. Useful when the DJ wants to see if one person is dominating the queue.

---

## Session Toggles That Affect Scoring

| Toggle | Effect on Scoring |
|---|---|
| `weightDecayEnabled` | Enables time-based decay (older plays count less) |
| `weightDecayHalfLifeMinutes` | Controls how fast plays fade; shorter = faster fade |

These are applied in `buildPlaysPerClient(requests, { decayEnabled, halfLifeMinutes, now })`.

---

## Example

Session state: 3 pending requests
- Alice: requests Electric Slide (never danced → weight 1.0)
- Bob: requests Electric Slide (danced once → weight 0.5)
- Charlie: requests Boot Scootin' Boogie (never danced → weight 1.0), tips 20 beats (100¢)

Scores:
- Electric Slide: `1.0 + 0.5 = 1.5`
- Boot Scootin' Boogie: `1.0 + 100/100 = 2.0` ← ranked higher due to tip

DJ sees Boot Scootin' first, Electric Slide second.

If Charlie had danced twice (`weight = 1/3 ≈ 0.33`):
- Boot Scootin': `0.33 + 1.0 = 1.33` ← would drop below Electric Slide

---

## Where It's Used

- **Controller pending panel** — re-scored on every SWR poll (every 5s)
- **Feed page** — does not display scores, but queue order reflects DJ's approved order which was influenced by scores
- **Tests** — `__tests__/fairnessScore.test.js` and `__tests__/pendingGroups.test.js`
