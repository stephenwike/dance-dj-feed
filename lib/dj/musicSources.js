'use strict';
/**
 * The music sources (playback plugins) a session can use: names and one-line
 * descriptions, kept free of any UI code so pages that only show the choice
 * (e.g. New event) don't load the plugins themselves. The controller's plugin
 * descriptors (components/dj-controller/plugins) take their label and
 * description from here. Prices: lib/dj/sessionAddOns.js.
 *
 * `comingSoon` sources are shown (disabled, with a "Coming soon" note) but
 * can't be chosen yet; the server refuses them too (isAvailable). A session
 * already playing with one keeps it.
 */
const MUSIC_SOURCES = [
  { id: 'standard', label: 'Standard', description: 'Play music from any source; the queue advances on a timer' },
  { id: 'local-files', label: 'Local Files', description: 'Play music from a folder on this computer (Chrome or Edge)' },
  { id: 'spotify', label: 'Spotify', description: 'Play through your Spotify account; the queue follows Spotify', comingSoon: true },
  { id: 'apple-music', label: 'Apple Music', description: 'Play through your Apple Music account', comingSoon: true },
];

const BY_ID = Object.fromEntries(MUSIC_SOURCES.map(s => [s.id, s]));

/** { id, label, description } for a plugin id (Standard for unknown ids). */
function musicSource(id) {
  return BY_ID[id] ?? BY_ID.standard;
}

/** Whether a source can be chosen for a session (known, and not coming soon). */
function isAvailable(id) {
  return !!BY_ID[id] && !BY_ID[id].comingSoon;
}

module.exports = { MUSIC_SOURCES, musicSource, isAvailable };
