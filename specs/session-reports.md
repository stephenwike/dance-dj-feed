# Workflow: Session Reports

**Actor:** DJ (Clerk-authenticated)  
**Entry point:** `/reports`  
**Outcome:** The DJ reviews a playlist report for a completed (or active) session and optionally exports it.

---

## Preconditions

- DJ is signed in
- At least one session exists (any status)

---

## Steps

1. DJ navigates to `/reports`
2. Client calls `GET /api/dj/sessions` — returns all sessions for the signed-in DJ, ordered by `startedAt` descending
3. Session list is shown in a sidebar:
   - Session name, date, status (active / closed)
   - Clicking a session loads its report
4. Client calls `GET /api/dj/sessions/[id]` — returns the session plus all requests with `status: 'played'`, ordered by `playStartedAt`
5. Played track list is shown:

   | Column | Description |
   |---|---|
   | Dance name | Name from `danceName` field |
   | Song | `songName` — or swap song if `isSongSwap: true` |
   | Artist | `artist` or swap artist |
   | Requesters | Count of distinct `clientId`s who requested this dance |
   | Times played | Count of played records for this dance |

6. Deduplication: if the same dance was requested by multiple attendees and played once, it appears as one row with `requesters: N`

---

## Filters

| Filter | Effect |
|---|---|
| Show partner dances | Toggle to include/exclude requests with `danceType: 'partner'` |
| Show custom requests | Toggle to include/exclude requests where `danceId: null` |

Filters apply client-side to the already-fetched data; no refetch needed.

---

## Export

### PNG Export
1. DJ taps **Export as Image**
2. `html-to-image` captures the report table as a PNG
3. Browser downloads `session-report-[slug].png`

### PDF Export
1. DJ taps **Export as PDF**
2. Same capture flow, rendered as a PDF via browser print dialog or jsPDF
3. DJ saves or prints the file

---

## Error States

| Condition | Behavior |
|---|---|
| Not signed in | Clerk redirects to sign-in |
| No sessions found | Empty state "No sessions yet" |
| `GET /api/dj/sessions/[id]` fails | Error message in the report panel |
| Export fails | Error toast; report still visible in-page |

---

## Notes

- Reports are read-only; no queue management actions are available here
- Active sessions can be viewed mid-event (shows what has played so far)
- The report is a simple playlist summary — it does not show tip amounts or attendee names
