# Session Pricing

**Status:** Accepted  
**Last updated:** 2026-09-09

## Overview

DJs pay for an event session when they start an event. Sessions are time-limited and charged via Stripe Checkout. When payments are disabled (`NEXT_PUBLIC_PAYMENTS_ENABLED !== 'true'`), sessions are created for free (development/testing mode).

## Session tiers

| Duration | Price |
|----------|-------|
| 2 hours | $2.00 |
| 5 hours | $4.00 |
| 8 hours | $6.00 |
| 12 hours | $8.00 |
| 1 day | $15.00 |

## Extensions

Running sessions can be extended at **$1.00 per additional hour**.

## Music sources (plugins) and add-ons

**Last updated:** 2026-10-04

Standard and Local Files are included with every session. Other integrations are **paid add-ons**, charged as a **flat fee per session** whatever its length. Spotify (it needs a Spotify Premium account) and Apple Music are the first ones, both **$1.00 for now** and marked **Coming soon**: shown but not selectable until they're ready (`lib/dj/musicSources.js`). Prices are in `lib/dj/sessionAddOns.js`.

- **Chosen when creating the event:** charged at launch as a separate line item.
- **Added mid-event:** bought from the controller's Music Source picker, by card or wallet.
- **Once bought:** the session can switch to and from the add-on freely, and extensions don't charge it again.
- **Included sources:** the DJ can always switch back to one.
- **Wallet prices:** the price minus the Stripe fee, the same rule as session tiers.

See `specs/session-start.md` for the flow and the server-side checks.

## Revenue model

Session fees are direct platform revenue. They are separate from beat tip earnings, which go entirely to the DJ (see [beat-economics.md](./beat-economics.md)).

The session fee covers:
- Database and infrastructure costs for the event
- Song request queue, attendee tipping, and scoring features
- Real-time sync and the attendee-facing request feed
