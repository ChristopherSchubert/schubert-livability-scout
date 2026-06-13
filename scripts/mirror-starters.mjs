#!/usr/bin/env node
// Mirror starter-city hero images that exist in the local manifest but not
// yet on Supabase. For each city in PER_CITY_QUERIES below:
//   1. Read the local hero file from public/assets/images/cities/<slug>/hero/...
//   2. Upload bytes to Supabase storage at city-images/cities/<slug>/<hash>.<ext>
//   3. UPDATE cities.hero_image with the resulting public URL
//   4. Add the per-city search phrase to CITY_IMAGE_QUERY_OVERRIDES
//   5. Rewrite manifest key from legacy template -> per-city phrase
//
// Idempotent: skips a city if Supabase already has hero_image set.

import { createHash } from "node:crypto";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";
import { createClient } from "@supabase/supabase-js";

// Per-city search phrase. Leveraged the stayZone / heart of each city from
// planner-data so the phrase points Google at the actual public-life heart.
const PER_CITY_QUERIES = {
  "Annapolis, MD": "Annapolis City Dock historic",
  "Ashland, OR": "Ashland Oregon Lithia Park plaza",
  "Beaufort, SC": "Beaufort SC Bay Street waterfront",
  "Bellingham, WA": "Bellingham Fairhaven downtown",
  "Cape May, NJ": "Cape May Washington Street Mall",
  "Carmel-by-the-Sea, CA": "Carmel-by-the-Sea Ocean Avenue",
  "Charleston, SC": "Charleston King Street historic",
  "Charlottesville, VA": "Charlottesville Downtown Mall",
  "Durango, CO": "Durango Main Avenue downtown",
  "Eureka Springs, AR": "Eureka Springs historic downtown",
  "Greenville, SC": "Greenville SC Main Street Falls Park",
  "Hood River, OR": "Hood River Oregon downtown",
  "Monterey / Pacific Grove, CA": "Pacific Grove California downtown",
  "Newburyport, MA": "Newburyport Market Square waterfront",
  "Petaluma, CA": "Petaluma historic downtown",
  "Santa Cruz, CA": "Santa Cruz Pacific Avenue downtown",
  "Savannah, GA": "Savannah Georgia historic squares",
  "St. Augustine, FL": "St Augustine historic St George Street",
  "St. Petersburg, FL": "St Petersburg Florida Beach Drive waterfront",
};

const BUCKET = "city-images";
const env = await loadEnv();
const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, secret || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
if (!secret) {
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: env.DEV_LOGIN_EMAIL,
    password: env.DEV_LOGIN_PASSWORD,
  });
  if (authErr) {
    console.error("Sign-in failed:", authErr.message, "(no SUPABASE_SECRET_KEY set)");
    process.exit(1);
  }
}

const { data: cityRows, error: rowsErr } = await sb.from("cities").select("id, name, hero_image");
if (rowsErr) { console.error(rowsErr.message); process.exit(1); }
const cityByName = new Map(cityRows.map((r) => [r.name, r]));

const root = process.cwd();
const imageRoot = join(root, "public/assets/images");
const manifestPath = join(imageRoot, "manifest.js");
const plannerDataPath = join(root, "lib/planner-data.js");

const manifestSrc = await readFile(manifestPath, "utf8");
const sandbox = { window: {} };
vm.runInNewContext(manifestSrc, sandbox);
const images = sandbox.window.CITY_TRIAL_IMAGES || {};
const choices = sandbox.window.CITY_TRIAL_IMAGE_CHOICES || {};

const overridesToAdd = {};
const results = [];

for (const [name, query] of Object.entries(PER_CITY_QUERIES)) {
  const row = cityByName.get(name);
  if (!row) { results.push({ name, status: "skip", reason: "no Supabase row" }); continue; }
  if (row.hero_image && !row.hero_image.startsWith("commons-search:")) {
    results.push({ name, status: "skip", reason: "already has Supabase hero" });
    continue;
  }

  const slug = slugify(name);
  const heroDir = join(imageRoot, "cities", slug, "hero");
  const entries = await readdir(heroDir).catch(() => []);
  const file = entries.find((e) => /\.(jpg|jpeg|png|webp)$/i.test(e));
  if (!file) { results.push({ name, status: "fail", reason: `no local file in ${heroDir}` }); continue; }

  const bytes = await readFile(join(heroDir, file));
  const ext = sniffExt(bytes) || extFromName(file);
  if (!ext) { results.push({ name, status: "fail", reason: "could not sniff ext" }); continue; }
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const path = `cities/${slug}/${hash}${ext}`;
  const contentType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";

  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (upErr) { results.push({ name, status: "fail", reason: `upload: ${upErr.message}` }); continue; }
  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  const { error: updErr } = await sb.from("cities").update({ hero_image: publicUrl }).eq("id", row.id);
  if (updErr) { results.push({ name, status: "fail", reason: `update row: ${updErr.message}` }); continue; }

  const legacyKey = `${name} downtown main street public life people color photo`;
  const localSrc = `./assets/images/cities/${slug}/hero/${file}`;
  images[query] = localSrc;
  if (query !== legacyKey && images[legacyKey]) delete images[legacyKey];
  if (choices[legacyKey]) delete choices[legacyKey];
  if (choices[query]) delete choices[query];

  overridesToAdd[name] = query;
  results.push({ name, status: "ok", supabase: publicUrl });
}

// Write manifest back, sorted
const sortedImages = Object.fromEntries(Object.entries(images).sort(([a], [b]) => a.localeCompare(b)));
const sortedChoices = Object.fromEntries(Object.entries(choices).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(
  manifestPath,
  `window.CITY_TRIAL_IMAGES = ${JSON.stringify(sortedImages, null, 2)};\n` +
  `window.CITY_TRIAL_IMAGE_CHOICES = ${JSON.stringify(sortedChoices, null, 2)};\n`,
);

// Merge new overrides into planner-data.js
if (Object.keys(overridesToAdd).length) {
  const plannerSrc = await readFile(plannerDataPath, "utf8");
  const marker = "export const CITY_IMAGE_QUERY_OVERRIDES = {";
  const start = plannerSrc.indexOf(marker);
  if (start === -1) throw new Error("override marker not found");
  const close = plannerSrc.indexOf("};", start);
  const before = plannerSrc.slice(0, start + marker.length);
  const block = plannerSrc.slice(start + marker.length, close);
  const after = plannerSrc.slice(close);

  const entries = new Map();
  for (const line of block.split("\n")) {
    const m = line.match(/^\s*"((?:[^"\\]|\\.)*)":\s*"((?:[^"\\]|\\.)*)",?\s*$/);
    if (m) entries.set(m[1].replace(/\\(.)/g, "$1"), m[2].replace(/\\(.)/g, "$1"));
  }
  for (const [k, v] of Object.entries(overridesToAdd)) entries.set(k, v);
  const sorted = [...entries.entries()].sort(([a], [b]) => a.localeCompare(b));
  const rebuilt = "\n" + sorted.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n") + "\n";
  await writeFile(plannerDataPath, before + rebuilt + after);
}

// Report
const ok = results.filter((r) => r.status === "ok").length;
const skip = results.filter((r) => r.status === "skip").length;
const fail = results.filter((r) => r.status === "fail").length;
console.log(`Mirrored ${ok} | Skipped ${skip} | Failed ${fail}`);
for (const r of results) {
  if (r.status === "ok") console.log(`  ✓ ${r.name}`);
  else console.log(`  - ${r.name}  [${r.status}] ${r.reason || ""}`);
}

function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 110);
}
function extFromName(n) {
  const m = n.match(/\.([a-z0-9]+)$/i);
  if (!m) return null;
  const e = m[1].toLowerCase();
  return e === "jpeg" ? ".jpg" : `.${e}`;
}
function sniffExt(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ".jpg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return ".png";
  if (buf.length >= 12 && buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return ".webp";
  return null;
}
async function loadEnv() {
  const text = await readFile(".env.local", "utf8");
  const out = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}
