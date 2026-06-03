# Workflow: DJ Announcements

**Actor:** DJ (Clerk-authenticated, in the controller)  
**Entry points:** `/dj-controller`, `/dj-spotify` — right-column messages panel  
**Outcome:** A text message appears on the feed display for attendees to see.

---

## Message Types

| Type | Display on Feed | Use Case |
|---|---|---|
| **Urgent** | Full-screen overlay | Break announcements, safety notices, last call |
| **In-Queue** | Persistent banner below now-playing | "Requests open", "Next dance in 5 min" |

---

## Preconditions

- DJ is signed in and on the controller page
- A feed page is open (either on a TV or by attendees on their phones)

---

## Post a Message

1. DJ opens the Messages panel in the right column
2. DJ types a custom message OR selects a template from `lib/messages/templates.js`
   - Example templates: "Last song before break", "Requests open for next hour", "Thank you for coming!"
3. DJ selects message type: Urgent or In-Queue
4. Optionally sets a display duration (seconds); leave blank for indefinite
5. DJ taps **Send**
6. Client calls `POST /api/dj/messages`:
   ```json
   {
     "sessionId": "...",
     "text": "Taking a 15-minute break — requests reopen at 9:30",
     "type": "urgent",
     "duration": 60
   }
   ```
7. Server:
   - Dismisses any currently active message for this session (sets `status: 'dismissed'`)
   - Creates a new message with `status: 'active'`
   - Sets `expiresAt = now + duration` if duration is provided
8. Feed page picks up the new message within 3 seconds (polling interval)
9. Message appears on feed

---

## Message Expiry

- If `duration` is set, the feed displays a countdown
- When `expiresAt` is reached, the feed stops showing the message client-side
- Server-side, the message remains `status: 'active'` until explicitly dismissed or a new message is posted (which auto-dismisses the prior one)

---

## Dismiss a Message

1. DJ taps **Dismiss** on the active message in the Messages panel
2. Client calls `PATCH /api/dj/messages/[id]` with `{ status: 'dismissed' }`
3. Feed stops showing the message on next poll (within 3 seconds)

---

## Feed Rendering

**Urgent message:**
- Rendered as a full-screen overlay on top of the now-playing card and queue
- Large, high-contrast text (white on dark or colored background)
- Countdown displayed if `duration` is set
- Attendees cannot dismiss it from the feed

**In-queue message:**
- Rendered as a banner in the queue area
- Smaller text, stays visible without blocking the now-playing card
- No countdown shown

---

## API

`GET /api/dj/messages?sessionId=...`
- Returns the single active, non-expired message for the session
- Returns `null` if no active message

`POST /api/dj/messages`
- Creates message; dismisses prior active message atomically

`PATCH /api/dj/messages/[id]`
- Sets `status: 'dismissed'`

---

## Error States

| Condition | Behavior |
|---|---|
| `POST` fails | Error toast; message not sent |
| Feed polling fails | Stale message shown until poll recovers |
| Multiple active messages (edge case) | Feed shows the most recently created one |
