'use strict';
// Small database helpers shared by the API routes and the CJS logic modules.
const { ObjectId } = require('mongodb');

const DB_NAME = process.env.MONGODB_DB || 'djfeed';

/** Parse a hex id into an ObjectId, or return null when it is not a valid id. */
function toObjectId(id) {
  if (id instanceof ObjectId) return id;
  if (typeof id !== 'string' || !/^[0-9a-f]{24}$/i.test(id)) return null;
  return new ObjectId(id);
}

/** Escape a user-supplied string for use inside a RegExp. */
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive exact-match filter for a string field. */
function exactCaseInsensitive(s) {
  return { $regex: `^${escapeRegex(s)}$`, $options: 'i' };
}

module.exports = { DB_NAME, toObjectId, escapeRegex, exactCaseInsensitive };
