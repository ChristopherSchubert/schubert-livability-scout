// Apply approved block proposals: cities.blocks = blocks_authored + picks.
// DRY-RUN by default — pass --commit to write. Excludes reference anchors
// (Slovenia baselines + the homebase) which have no walkable core to author from.
//
//   node scripts/.save-block-proposals.mjs            # dry run, show diffs
//   node scripts/.save-block-proposals.mjs --commit   # write to Supabase
//
// IDEMPOTENT: the baseline is the durable `blocks_authored` column (read fresh
// from the DB here), NOT the proposals file's `existing` field — so re-running
// always rebuilds from the human baseline and can never compound. After
// committing, run the maps pass:
//   OVERPASS_URL=http://localhost:12345/api/interpreter \
//     node scripts/onboard.mjs --measurer blocks --force
import { readFileSync } from "node:fs";
import { connect } from "../lib/measurers/_db.js";

const EXCLUDE = new Set(["bled-slovenia", "piran-slovenia", "ljubljana-slovenia", "allison-park-pa"]);
const commit = process.argv.includes("--commit");

const j = JSON.parse(readFileSync("/tmp/block-proposals.json", "utf8"));
const client = await connect();

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

let changed = 0, skipped = 0, added = 0;
for (const slug of Object.keys(j).sort()) {
  const c = j[slug];
  if (c.error || EXCLUDE.has(slug)) { skipped++; continue; }
  const picks = (c.candidates || []).slice(0, c.need).map((p) => p.block);
  if (!picks.length) { skipped++; continue; }

  // Baseline = the human-authored blocks straight from the DB (durable, not the
  // proposals file). blocks = authored + picks-not-already-present.
  const { rows } = await client.query(`select blocks_authored, blocks from cities where slug=$1`, [slug]);
  if (!rows.length) { skipped++; continue; }
  const authored = Array.isArray(rows[0].blocks_authored) ? rows[0].blocks_authored : [];
  const current = Array.isArray(rows[0].blocks) ? rows[0].blocks : [];
  const have = new Set(authored.map(norm));
  const freshPicks = picks.filter((p) => !have.has(norm(p)));
  const merged = [...authored, ...freshPicks];
  // No-op guard: if the result equals what's already stored, skip the write —
  // a needless update would clear block_geometries and wipe resolved pins.
  if (JSON.stringify(merged) === JSON.stringify(current)) { skipped++; continue; }

  changed++; added += freshPicks.length;
  console.log(`${slug}: ${current.length} → ${merged.length}  (authored ${authored.length} + ${freshPicks.length})`);
  if (commit) {
    // Rebuild blocks from the authored baseline + picks; clear block_geometries
    // so no stale/mismatched pins render before the measurer re-resolves them.
    await client.query(`update cities set blocks = $1::jsonb, block_geometries = '[]'::jsonb where slug = $2`,
      [JSON.stringify(merged), slug]);
  }
}
console.log(`\n${commit ? "COMMITTED" : "DRY RUN"} — ${changed} cities changed, ${added} blocks added, ${skipped} skipped (anchors/at-target/no-picks).`);
await client.end();
