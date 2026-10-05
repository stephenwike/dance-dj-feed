# Workflow: Start an Event

**Actor:** DJ (signed in with next-auth)
**Entry points:** `/start` (Your events), `/dj-session-config` (New event), `/dj-start-session` (Start session)
**Outcome:** The event is created. From its card on Your events, the DJ plans the set and/or presses **Start session**, chooses how to pay, and lands in the controller with the event live and the "Get the room ready" card open.

The controller only ever shows **live** events. Drafts are planned on their own page (`/dj-plan`) and reach the controller once they go live.

---

## Pages

| Page | What it's for |
|---|---|
| `/start`: **Your events** | Live events (**Open controller →**), events not live yet (**event cards**, below), recent events (**Report →**), **+ New event**. `?event=<id>` highlights an event just created |
| `/dj-session-config`: **New event** | Name, length and **music source**, then **Create event**, which saves it (nothing charged) and opens its card on Your events. With `?id=<draft>` it edits that event (`&from=plan` returns to Plan the set) |
| `/dj-plan?id=<draft>`: **Plan the set** | Add dances (the controller's Add to Queue panel), reorder by drag (press and hold on a phone), remove. Saved as you go. **▶ Start session** or **Done for now** |
| `/dj-start-session?id=<draft>`: **Start session** | What starting does, the event and its price, then **How would you like to pay?**: **DanceFeed wallet** (cheaper, no card fees; badged "Best price"; disabled when the balance doesn't cover it) or **Card** (Stripe Checkout). Wallet is pre-selected when it covers the cost. The button names the outcome: "Pay $X from wallet & start" or "Continue to card payment · $Y". While payments are off: one **▶ Start session** button. `&from=plan` returns to Plan the set |
| `/dj-controller` | The live event. After going live it shows the **Get the room ready** card: feed link and QR for the TV, request link and QR for dancers, and **Got it** |

### Event cards

Every event on Your events uses the same compact one-line card, with the same border; status shows in the dot (green pulse = live) and the details line.
- **Live:** "Live · Standard" and **Open controller →**
- **Not started:** "Not started · 5 hrs · Local Files · Edit · Delete" and **Plan set** / **▶ Start**. **Edit** reopens the New event form for this event; **Delete** asks for confirmation.

On a phone the buttons wrap below the name.

## Flows

```
New event ─▶ Create event ─▶ Your events (event card)
Event card / Plan the set ─▶ Start session ─▶ choose wallet or card ─▶ (Stripe Checkout for card, unless free) ─▶ Controller + Get the room ready
Event card ─▶ Plan your set ─▶ Plan the set
Event card ─▶ Edit ─▶ New event form (this event) ─▶ back to Your events
Your events ─▶ live event ─▶ Open controller
```

- **Going live without Stripe:** either the DJ isn't charged, or they pay from the wallet. The server returns `{ session }` and the page opens `/dj-controller?welcome=<id>`.
- **Paying by card:** the server returns a Stripe Checkout `{ url }`.
  - When paid, Stripe returns to `/dj-controller?session_started=1`. The controller shows "Payment received — starting your event…" and polls `GET /api/dj/sessions` (every 2 s, up to 10 times) for the session the webhook creates, using the time saved in `sessionStorage` before checkout. It then selects that session and opens the Get the room ready card.
  - If the DJ cancels, Stripe returns to the page they came from.
- **Old links:** `/start?session_started=1` (the old Stripe return) redirects to the controller's version.
- **Opening a specific event:** `/dj-controller?session=<id>` opens that live event; "Open controller" uses it.

---

## Pricing

**Length:** per tier, from `lib/dj/sessionPricing.js` (see `docs/decisions/session-pricing.md`). Extensions are bought in the controller.

**Music source:** from `lib/dj/sessionAddOns.js` and `lib/dj/musicSources.js`.

| Source | Price |
|---|---|
| Standard | Included |
| Local Files | Included |
| Spotify | Flat add-on per event, $1.00 (provisional) · **Coming soon** |
| Apple Music | Flat add-on per event, $1.00 (provisional) · **Coming soon** |

**Coming soon** sources (`comingSoon` in `lib/dj/musicSources.js`) are shown disabled, with their price and a "Coming soon" note, on New event and in the controller's picker. The server refuses them everywhere a source is chosen: draft create/update, launch, add-on purchase, and switching a live session (`isAvailable`). A session already on one (e.g. a Spotify event started earlier) keeps it.

- An add-on chosen when creating the event is charged at launch as a **separate line item** ("DJ Session — 2 hrs", "Spotify add-on").
- The **wallet price** is the total minus the Stripe fee (2.9% + 30¢).
- During the event, the controller's **Music Source** picker:
  - always switches between included sources
  - shows a paid source the event hasn't bought with its price, and opens **Add to this event** (card or wallet)
  - once a source is bought, switches to and from it freely; extensions don't charge it again
- The server enforces this: `PATCH /api/dj/sessions/[id]` returns **402** for a paid `plugin` the session doesn't own (`addOns`). Drafts may pick any source, because it's charged at launch.

**Who pays:** a DJ isn't charged (`lib/server/dj/sessionAccess.js#djPays`) when payments are disabled (`NEXT_PUBLIC_PAYMENTS_ENABLED !== 'true'`) or their email is in `free_access`. Everything then goes live and every add-on is added without a checkout.

---

## API

| Method | Route | Body | Result |
|---|---|---|---|
| `POST` | `/api/dj/sessions/draft` | `{ name, durationMinutes, plugin }` | `201 { session }`: a draft (no `startedAt`/`endsAt`, `addOns: []`) |
| `PATCH` | `/api/dj/sessions/[id]` | `{ name?, durationMinutes?, plugin?, … }` | `{ ok }`; `402 { error, addOn }` for an unowned paid source on a live session |
| `POST` | `/api/dj/sessions/checkout` | `{ draftSessionId }` or `{ name, durationMinutes, plugin }`, plus `returnUrl`, `cancelUrl` | `201 { session }` if not charged, else `{ url }` (Stripe) |
| `POST` | `/api/dj/sessions/wallet-pay` | as checkout | `201 { session }`, paid at the wallet price |
| `POST` | `/api/dj/sessions/add-on` | `{ sessionId, plugin, payFromWallet?, returnUrl? }` | `{ session }` (owned already, free, or wallet), else `{ url }` (Stripe; returns with `?addon_success=1`) |

Checkout and wallet payment share `lib/server/dj/launchRequest.js#resolveLaunch`:
- A draft launches with its saved length and music source, unless the body overrides them.
- The charge comes from `launchCharge(tier, plugin)`.

## Data

`dj_sessions`:
- `plugin`: the current music source
- `addOns`: the paid sources this event has bought (`[]` or e.g. `['spotify']`). Set at launch (`addOnsForLaunch`) and grown by `addSessionAddOn`, which uses `$addToSet` so a replayed webhook is harmless.

Stripe webhook (`checkout.session.completed`):

| Metadata `type` | Does |
|---|---|
| `dj_session` | Creates the session, or activates the draft (the activation only applies while it's still a draft), with `plugin` and `addOns`; logs `session_transactions` `session_purchase` |
| `session_add_on` | Adds the add-on and switches to it; logs `session_transactions` `session_add_on` |

Wallet payments log `dj_wallet_transactions` `session_payment` entries with `addOns`.

---

## Error States

| Condition | Behavior |
|---|---|
| Not signed in | Middleware redirects to sign-in |
| Blank event name | "Give your event a name." on New event |
| Name already used by a live event or draft | `409` from draft create/update; shown on the form |
| Draft without a length | Start session says to choose a length first (Edit) |
| Wallet balance too low | The wallet option is disabled and says so, showing the balance; the server also returns `400` |
| Stripe Checkout cancelled | Back on the page the DJ came from; nothing created |
| Webhook slower than ~20 s | The controller asks the DJ to refresh in a moment |
| Opening `/dj-plan` for a live event | Redirects to the controller |
