# Workflow: Start a Session

**Actor:** DJ (Clerk-authenticated)  
**Entry point:** `/start`  
**Outcome:** A new DJ session is created (or an existing active session is resumed), and the DJ lands on the appropriate controller.

---

## Preconditions

- DJ is signed in via Clerk
- No session is currently active, OR the DJ wants to resume an existing active session

---

## Happy Path — Create New Session

1. DJ navigates to `/start`
2. Page calls `GET /api/dj/sessions` to check for an existing active session
3. No active session found — creation form is displayed
4. DJ optionally enters a session name (defaults to today's date if blank)
5. DJ selects a duration: 60, 120, 180, or 240 minutes
6. DJ selects a music source:
   - **Standard** — manual play advancement with a countdown timer
   - **Spotify** — Spotify playback controls and auto-advance
7. DJ clicks **Start Session**
8. Client calls `POST /api/dj/sessions` with `{ name, plugin, durationMinutes }`
9. Server:
   - Closes all other active sessions owned by this DJ (`status: 'closed'`)
   - Creates a new session document in `dj_sessions` with `status: 'active'`, `ownerId`, `slug`, `startedAt`, `endsAt`
10. Client receives the new session and redirects:
    - Standard → `/dj-controller`
    - Spotify → `/dj-spotify`

---

## Alternate Path — Resume Active Session

1. DJ navigates to `/start`
2. `GET /api/dj/sessions` returns an active session
3. Page shows a "Resume" prompt with the session name and start time
4. DJ clicks **Resume**
5. Client redirects to the controller that matches the session's `plugin` field

---

## Validation

| Field | Rule |
|---|---|
| `name` | Optional; max ~100 chars; defaults server-side to today's date |
| `plugin` | Required; must be `'standard'` or `'spotify'` |
| `durationMinutes` | Required; one of 60, 120, 180, 240 |

---

## API

`POST /api/dj/sessions`

```json
{
  "name": "Friday Night",
  "plugin": "standard",
  "durationMinutes": 120
}
```

Response: the created session document including `_id`, `slug`, `status`, `endsAt`.

---

## Side Effects

- All previous active sessions for this DJ are closed when a new session is created
- Session slug is generated from the name (URL-safe, e.g. `friday-night`)
- The feed and request QR code URLs are derived from the slug

---

## Error States

| Condition | Behavior |
|---|---|
| Not signed in | Clerk middleware redirects to sign-in |
| `POST /api/dj/sessions` fails | Error shown on form; no redirect |
