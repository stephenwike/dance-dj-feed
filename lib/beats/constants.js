'use strict';
// 1 Beat = $0.05 face value to the DJ. Never show this rate in the UI — show beats only.
const BEAT_VALUE_CENTS = 5;

/** Whole beats represented by a tip amount in cents. */
function beatsFromCents(cents) {
  return Math.round((cents ?? 0) / BEAT_VALUE_CENTS);
}

module.exports = { BEAT_VALUE_CENTS, beatsFromCents };
