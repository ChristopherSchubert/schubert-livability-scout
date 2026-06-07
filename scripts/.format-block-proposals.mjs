// Turn /tmp/block-proposals.json into a human-reviewable markdown doc.
// Each city shows existing blocks + proposed additions (the first `need`
// candidates are the picks; any beyond that are alternates). Edit the doc
// or tell me changes; nothing is saved until you approve.
import { readFileSync, writeFileSync } from "node:fs";

const j = JSON.parse(readFileSync("/tmp/block-proposals.json", "utf8"));
const slugs = Object.keys(j).sort((a, b) => j[a].name.localeCompare(j[b].name));

const lines = ["# Six-blocks proposals (OSM-derived, awaiting review)", "",
  "Existing blocks are kept. **Picks** (✓) are the additions that bring each city to 6; **alternates** (·) are extra options if you want to swap. All grounded in real OSM social-POI density inside the stay zone. Nothing saved yet.", ""];

let needAuthor = 0, shortCities = [];
for (const slug of slugs) {
  const c = j[slug];
  if (c.error) { lines.push(`## ${c.name} \`${slug}\` — ⚠️ ${c.error}`, ""); continue; }
  const have = c.existing.length;
  if (have >= 6) continue;
  needAuthor++;
  const picks = c.candidates.slice(0, c.need);
  const alts = c.candidates.slice(c.need);
  if (picks.length < c.need) shortCities.push(`${slug} (${have}+${picks.length}=${have + picks.length})`);
  lines.push(`## ${c.name} \`${slug}\` — have ${have}, +${picks.length} → ${have + picks.length}`);
  c.existing.forEach((b, i) => lines.push(`${i + 1}. ${b}`));
  picks.forEach((p) => lines.push(`- ✓ **${p.block}** — _${p.why}_`));
  alts.forEach((p) => lines.push(`- · ${p.block} — _${p.why}_`));
  lines.push("");
}
lines.splice(4, 0, `> ${needAuthor} cities need blocks. ${shortCities.length ? "Could not reach 6 (small towns / thin OSM): " + shortCities.join(", ") + "." : "All reached 6."}`, "");
writeFileSync("docs/six-blocks-proposals.md", lines.join("\n"));
console.log(`wrote docs/six-blocks-proposals.md — ${needAuthor} cities, ${shortCities.length} short of 6`);
