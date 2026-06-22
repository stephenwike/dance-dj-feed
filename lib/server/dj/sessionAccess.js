'use strict';

function getFreeSessionEmails() {
  return (process.env.DJ_FREE_SESSION_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

function isFreeSessionEmail(email) {
  if (!email) return false;
  return getFreeSessionEmails().includes(email.toLowerCase());
}

module.exports = { isFreeSessionEmail };
