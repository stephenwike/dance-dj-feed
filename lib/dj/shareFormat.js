'use strict';
/**
 * Text for a shared session report (lib/server/dj/shareLogic.js), used by
 * its page, link preview and cover image alike. Dates are in the report's
 * time zone (the DJ's), so the server and the browser agree.
 */

function formatShareDate(iso, timeZone) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone,
  });
}

function formatShareTime(iso, timeZone) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone });
}

function formatShareDuration(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** "Sat, Oct 18, 2026 · 3h 12m · DJ Stephen", or "… · Live now". */
function shareMeta(report) {
  return [
    formatShareDate(report.startedAt, report.timeZone),
    report.live ? 'Live now' : report.durationMs ? formatShareDuration(report.durationMs) : null,
    report.hostName ? `DJ ${report.hostName}` : null,
  ].filter(Boolean).join(' · ');
}

/** One line for link previews: "42 dances · 28 dancers · 96 requests". */
function shareSummary(report) {
  const { dances, dancers, requests } = report.stats;
  return [plural(dances, 'dance'), dancers ? plural(dancers, 'dancer') : null, requests ? plural(requests, 'request') : null]
    .filter(Boolean).join(' · ');
}

module.exports = { formatShareDate, formatShareTime, formatShareDuration, plural, shareMeta, shareSummary };
