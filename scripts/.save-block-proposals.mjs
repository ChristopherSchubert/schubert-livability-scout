// Apply approved block proposals to cities.blocks. Reads /tmp/block-proposals.json
// and appends each city's PICKS (the first `need` candidates) to its existing
// blocks. DRY-RUN by default — pass --commit to write. Excludes reference
// anchors (Slovenia baselines + the homebase suburb) which have no walkable
// social core to author from.
//
//   node scripts/.save-block-proposals.mjs            # dry run, show diffs
//   node scripts/.save-block-proposals.mjs --commit   # write to Supabase
//
// After committing, run the maps pass:
//   OVERPASS_URL=http://localhost:12345/api/interpreter \
//     node scripts/onboard.mjs --measurer blocks --force
import { readFileSync } from "node:fs";
import { connect } from "../lib/measurers/_db.js";

const EXCLUDE = new Set(["bled-slovenia", "piran-slovenia", "ljubljana-slovenia", "allison-park-pa"]);
const commit = process.argv.includes("--commit");

const j = JSON.parse(readFileSync("/tmp/block-proposals.json", "utf8"));
const client = await connect();

let changed = 0, skipped = 0, added = 0;
for (const slug of Object.keys(j).sort()) {
  const c = j[slug];
  if (c.error || EXCLUDE.has(slug)) { skipped++; continue; }
  const existing = c.existing || [];
  if (existing.length >= 6) { skipped++; continue; }
  const picks = (c.candidates || []).slice(0, c.need).map((p) => p.block);
  if (!picks.length) { skipped++; continue; }
  const merged = [...existing, ...picks];
  changed++; added += picks.length;
  console.log(`${slug}: ${existing.length} → ${merged.length}  (+ ${picks.join(" | ")})`);
  if (commit) {
    // Overwrite blocks (folds out any earlier over-eager auto-save) and clear
    // block_geometries so no stale/mismatched pins render before the measurer
    // re-resolves them in the --force pass that follows.
    await client.query(`update cities set blocks = $1::jsonb, block_geometries = '[]'::jsonb where slug = $2`,
      [JSON.stringify(merged), slug]);
  }
}
console.log(`\n${commit ? "COMMITTED" : "DRY RUN"} — ${changed} cities changed, ${added} blocks added, ${skipped} skipped (anchors/complete/empty-gen).`);
await client.end();
