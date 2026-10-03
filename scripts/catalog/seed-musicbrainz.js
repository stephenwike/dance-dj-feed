/**
 * Seed the music catalog (MUSIC_CATALOG_DB, default "music_catalog") with
 * recordings from the MusicBrainz web service, by artist.
 *
 * Usage:
 *   node scripts/catalog/seed-musicbrainz.js --artist "Steve Earle" --artist "George Strait"
 *   node scripts/catalog/seed-musicbrainz.js --artists-file scripts/catalog/artists.txt
 *
 * Options:
 *   --max-per-artist N  stop after N recordings per artist (default 300)
 *   --isrcs             also look up each recording's ISRCs (one extra request
 *                       per recording, so roughly 1 recording/second)
 *   --dry-run           fetch and print counts, write nothing
 *
 * Requires MUSICBRAINZ_CONTACT (an email or URL) in the environment or
 * .env.local: MusicBrainz asks every client to identify itself, and throttles
 * anonymous ones. Requests are spaced at just over 1/second, their limit.
 *
 * Safe to re-run: tracks are upserted by MusicBrainz id, and ISRCs found by
 * earlier runs are kept.
 */

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const { ensureIndexes, upsertTracks, CATALOG_DB } = require('../../lib/server/catalog/trackCatalog');
const { fromRecording } = require('../../lib/server/catalog/musicbrainz');
const { createListenBrainzClient, rankByListens } = require('../../lib/server/catalog/listenbrainzClient');

// Load .env.local without dotenv
const envPath = path.resolve(__dirname, '../../.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').replace(/\r/g, '').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

const API = 'https://musicbrainz.org/ws/2';
const PAGE_SIZE = 100;
const MIN_GAP_MS = 1100;
const MAX_RETRIES = 3;

function parseArgs(argv) {
  const opts = { artists: [], maxPerArtist: 300, isrcs: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--artist') opts.artists.push(argv[++i]);
    else if (arg === '--artists-file') {
      const lines = fs.readFileSync(argv[++i], 'utf8').replace(/\r/g, '').split('\n');
      opts.artists.push(...lines.map(l => l.trim()).filter(l => l && !l.startsWith('#')));
    } else if (arg === '--max-per-artist') opts.maxPerArtist = Number(argv[++i]);
    else if (arg === '--isrcs') opts.isrcs = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!opts.artists.length) throw new Error('Give at least one --artist or an --artists-file');
  if (!Number.isInteger(opts.maxPerArtist) || opts.maxPerArtist < 1) throw new Error('--max-per-artist must be a positive integer');
  return opts;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function makeClient(contact) {
  const userAgent = `LineDanceDJFeed/0.1 ( ${contact} )`;
  let last = 0;
  return async function get(pathAndQuery) {
    for (let attempt = 0; ; attempt++) {
      const wait = last + MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      const res = await fetch(`${API}${pathAndQuery}`, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
      if (res.ok) return res.json();
      // 503 = rate limited; back off and retry.
      if (res.status === 503 && attempt < MAX_RETRIES) { await sleep(MIN_GAP_MS * 2 ** (attempt + 1)); continue; }
      throw new Error(`MusicBrainz ${res.status} for ${pathAndQuery}`);
    }
  };
}

async function* recordingsByArtist(get, artist, max) {
  const query = encodeURIComponent(`artist:"${artist.replace(/"/g, '')}"`);
  for (let offset = 0; offset < max; offset += PAGE_SIZE) {
    const page = await get(`/recording?query=${query}&limit=${PAGE_SIZE}&offset=${offset}&fmt=json`);
    const recordings = page.recordings ?? [];
    yield recordings.slice(0, max - offset);
    if (offset + PAGE_SIZE >= (page.count ?? 0) || recordings.length < PAGE_SIZE) return;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const contact = process.env.MUSICBRAINZ_CONTACT;
  if (!contact) throw new Error('Set MUSICBRAINZ_CONTACT (email or URL) so MusicBrainz can identify this client');
  if (!process.env.MONGODB_URI) throw new Error('Missing MONGODB_URI');

  const get = makeClient(contact);
  // Listen counts rank the catalog (MusicBrainz has no popularity signal).
  const listenbrainz = createListenBrainzClient({ userAgent: `LineDanceDJFeed/0.1 ( ${contact} )` });
  const client = opts.dryRun ? null : await new MongoClient(process.env.MONGODB_URI).connect();
  try {
    if (client) await ensureIndexes(client);
    console.log(`${opts.dryRun ? '[dry run] ' : ''}Seeding ${CATALOG_DB}.tracks from MusicBrainz for ${opts.artists.length} artist(s)`);

    const totals = { fetched: 0, kept: 0, upserted: 0, modified: 0 };
    for (const artist of opts.artists) {
      let kept = 0;
      for await (const page of recordingsByArtist(get, artist, opts.maxPerArtist)) {
        totals.fetched += page.length;
        const records = [];
        for (const r of page) {
          const rec = fromRecording(r);
          if (!rec) continue;
          if (opts.isrcs) {
            const full = await get(`/recording/${rec.sourceId}?inc=isrcs&fmt=json`);
            rec.isrcs = full.isrcs ?? [];
          }
          records.push(rec);
        }
        kept += records.length;
        if (client) {
          const res = await upsertTracks(client, await rankByListens(listenbrainz, records));
          totals.upserted += res.upserted;
          totals.modified += res.modified;
        }
      }
      totals.kept += kept;
      console.log(`  ${artist}: ${kept} recordings`);
    }
    console.log(`Done. fetched=${totals.fetched} kept=${totals.kept} new=${totals.upserted} updated=${totals.modified}`);
  } finally {
    await client?.close();
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
