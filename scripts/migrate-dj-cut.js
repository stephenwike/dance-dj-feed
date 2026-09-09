/**
 * One-time migration: correct dj_wallet_transactions entries that were created
 * with DJ_CUT = 0.9, which shorted DJs 10% of face value per beat tipped.
 *
 * For each beat_tip entry, the correct amount is: abs(beat_transactions.beats) * 5 cents.
 * If the recorded amountCents is less, a correction entry is inserted.
 *
 * Run with: node scripts/migrate-dj-cut.js
 * Safe to re-run — skips entries already at correct value and avoids double-correcting.
 */

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Load .env.local without dotenv
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').replace(/\r/g, '').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'djfeed';
const BEAT_VALUE_CENTS = 5;
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  if (!MONGODB_URI) throw new Error('MONGODB_URI not set in .env.local');

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  console.log(DRY_RUN ? '[DRY RUN] No writes will be made.\n' : '[LIVE] Writing corrections to DB.\n');


  // Load all beat_tip wallet entries
  const beatTips = await db.collection('dj_wallet_transactions')
    .find({ type: 'beat_tip' })
    .toArray();

  console.log(`Found ${beatTips.length} beat_tip wallet entries to inspect.`);

  // Load all beat transactions (attendee-side debits) to get beats count
  const beatTxns = await db.collection('beat_transactions')
    .find({ type: 'tip' })
    .toArray();

  // Index by requestId + attendeeId for fast lookup
  const beatTxnIndex = new Map();
  for (const t of beatTxns) {
    const key = `${t.requestId}::${t.attendeeId}`;
    if (!beatTxnIndex.has(key)) beatTxnIndex.set(key, []);
    beatTxnIndex.get(key).push(t);
  }

  let corrected = 0;
  let skipped = 0;
  let missing = 0;
  const corrections = [];

  for (const tip of beatTips) {
    const key = `${tip.requestId}::${tip.attendeeId}`;
    const matches = beatTxnIndex.get(key) ?? [];

    if (matches.length === 0) {
      console.warn(`  [WARN] No beat_transaction found for requestId=${tip.requestId} attendeeId=${tip.attendeeId}`);
      missing++;
      continue;
    }

    // Use the match closest in time (should be exact since both use the same `now`)
    const tipDate = new Date(tip.createdAt).getTime();
    const match = matches.reduce((closest, t) =>
      Math.abs(new Date(t.createdAt).getTime() - tipDate) <
      Math.abs(new Date(closest.createdAt).getTime() - tipDate) ? t : closest
    );

    const beats = Math.abs(match.beats);
    const expected = beats * BEAT_VALUE_CENTS;
    const shortfall = expected - tip.amountCents;

    if (shortfall <= 0) {
      skipped++;
      continue;
    }

    console.log(`  Correction: requestId=${tip.requestId} attendeeId=${tip.attendeeId} beats=${beats} recorded=${tip.amountCents}¢ expected=${expected}¢ shortfall=+${shortfall}¢`);

    corrections.push({
      ownerId: tip.ownerId,
      type: 'dj_cut_correction',
      amountCents: shortfall,
      requestId: tip.requestId,
      attendeeId: tip.attendeeId,
      originalWalletTxId: String(tip._id),
      createdAt: new Date(),
      note: 'Retroactive correction: DJ_CUT raised from 0.9 to 1.0',
    });

    corrected++;
  }

  const totalShortfallCents = corrections.reduce((sum, c) => sum + c.amountCents, 0);
  console.log(`\nSummary: ${corrected} to correct, ${skipped} already correct, ${missing} missing beat_transaction.`);
  console.log(`Total owed to DJs: $${(totalShortfallCents / 100).toFixed(2)} (${totalShortfallCents}¢)`);

  if (corrections.length > 0 && !DRY_RUN) {
    await db.collection('dj_wallet_transactions').insertMany(corrections);
    console.log(`Inserted ${corrections.length} correction entries.`);
  } else if (corrections.length > 0) {
    console.log(`[DRY RUN] Would insert ${corrections.length} correction entries.`);
  }

  await client.close();
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
