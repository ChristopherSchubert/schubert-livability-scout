// scripts/.apply-blurbs.mjs — write hand-authored block blurbs into
// cities.block_blurbs. Reads /tmp/blurbs.json: { slug: [blurb, blurb, …] }, the
// array parallel to that city's blocks. Validates the count matches before
// writing, so a mis-aligned list can't silently shift blurbs onto wrong blocks.
//
//   node scripts/.apply-blurbs.mjs            # validate + show
//   node scripts/.apply-blurbs.mjs --commit   # write
import { readFileSync } from "node:fs";
import { connect } from "../lib/measurers/_db.js";

const commit = process.argv.includes("--commit");
const data = JSON.parse(readFileSync("/tmp/blurbs.json", "utf8"));
const client = await connect();
let ok = 0, mismatch = 0;
for (const [slug, blurbs] of Object.entries(data)) {
  const { rows } = await client.query("select blocks from cities where slug=$1", [slug]);
  if (!rows[0]) { console.log(`! ${slug}: no city`); mismatch++; continue; }
  const n = (rows[0].blocks || []).length;
  if (blurbs.length !== n) { console.log(`! ${slug}: ${blurbs.length} blurbs but ${n} blocks — SKIP`); mismatch++; continue; }
  ok++;
  if (commit) await client.query("update cities set block_blurbs=$1::jsonb where slug=$2", [JSON.stringify(blurbs), slug]);
}
console.log(`\n${commit ? "COMMITTED" : "VALIDATED"} — ${ok} cities ok, ${mismatch} skipped (count mismatch)`);
await client.end();
