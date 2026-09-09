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

## Plugins / integrations

Sessions can be created with the `standard` or `spotify` plugin. The Spotify plugin enables Spotify playback integration (requires the DJ to have a Spotify Premium account).

## Revenue model

Session fees are direct platform revenue. They are separate from beat tip earnings, which go entirely to the DJ (see [beat-economics.md](./beat-economics.md)).

The session fee covers:
- Database and infrastructure costs for the event
- Song request queue, attendee tipping, and scoring features
- Real-time sync and the attendee-facing request feed
