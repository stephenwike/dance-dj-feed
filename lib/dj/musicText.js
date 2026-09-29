'use strict';
/**
 * Text normalisation for song titles and artists. Shared by the music
 * catalog (server) and the local-files matcher (browser): both sides must
 * normalise identically, or catalog tracks won't match the DJ's files.
 */

/**
 * Comparable form of a title or artist: lower case, no accents, no bracketed
 * suffixes ("(Radio Edit)", "[Remastered]"), no "feat." credits, and only
 * letters/digits separated by single spaces.
 */
function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[([][^)\]]*[)\]]/g, ' ')
    .replace(/\s(feat|ft)\.?\s.*$/, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

module.exports = { normalizeText };
