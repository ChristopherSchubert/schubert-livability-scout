#!/usr/bin/env node
// Save one hero image for a city from a pasted URL. Mirrors to BOTH:
//   - Local: public/assets/images/cities/<slug>/hero/<hash>.<ext> + manifest.js
//   - Supabase: city-images/cities/<slug>/<hash>.<ext> + cities.hero_image
// Also updates CITY_IMAGE_QUERY_OVERRIDES in lib/planner-data.js.
//
// Usage: node scripts/save-hero.mjs "<City, ST>" "<image url>" "<search phrase>"

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";
import { createClient } from "@supabase/supabase-js";

const [, , rawName, rawUrl, rawQuery] = process.argv;
if (!rawName || !rawUrl || !rawQuery) {
  console.error('Usage: node scripts/save-hero.mjs "<City, ST>" "<url>" "<search phrase>"');
  process.exit(2);
}

const name = rawName.trim();
const url = rawUrl.trim();
const query = rawQuery.trim();
const slug = slugify(name);
const legacyKey = `${name} downtown main street public life people color photo`;

const root = process.cwd();
const imageRoot = join(root, "public/assets/images");
const manifestPath = join(imageRoot, "manifest.js");
const plannerDataPath = join(root, "lib/planner-data.js");
const heroFolder = join(imageRoot, "cities", slug, "hero");
const env = await loadEnv();

const res = await fetch(url, { headers: { "User-Agent": "LivabilityScout/2.0 hero saver" } });
if (!res.ok) { console.error(`Fetch failed: ${res.status} ${res.statusText}`); process.exit(1); }
const bytes = Buffer.from(await res.arrayBuffer());
const ext = sniffExt(bytes);
if (!ext) { console.error("Unrecognized image format (need jpeg/png/webp)."); process.exit(1); }

const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
const filename = `${hash}${ext}`;

// ── Local file + manifest ─────────────────────────────────────────────────
await mkdir(heroFolder, { recursive: true });
for (const entry of await readdir(heroFolder).catch(() => [])) {
  if (entry !== filename) await unlink(join(heroFolder, entry)).catch(() => {});
}
await writeFile(join(heroFolder, filename), bytes);

const manifestSource = await readFile(manifestPath, "utf8");
const sandbox = { window: {} };
vm.runInNewContext(manifestSource, sandbox);
const images = sandbox.window.CITY_TRIAL_IMAGES || {};
const choices = sandbox.window.CITY_TRIAL_IMAGE_CHOICES || {};
const localSrc = `./assets/images/cities/${slug}/hero/${filename}`;
images[query] = localSrc;
if (query !== legacyKey && images[legacyKey]) delete images[legacyKey];
if (choices[query]) delete choices[query];
if (choices[legacyKey]) delete choices[legacyKey];
const sortedImages = Object.fromEntries(Object.entries(images).sort(([a], [b]) => a.localeCompare(b)));
const sortedChoices = Object.fromEntries(Object.entries(choices).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(
  manifestPath,
  `window.CITY_TRIAL_IMAGES = ${JSON.stringify(sortedImages, null, 2)};\n` +
  `window.CITY_TRIAL_IMAGE_CHOICES = ${JSON.stringify(sortedChoices, null, 2)};\n`,
);

// ── Supabase mirror ───────────────────────────────────────────────────────
let publicUrl = null;
let supabaseStatus = "skipped (no env)";
const _secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (env.NEXT_PUBLIC_SUPABASE_URL && (_secret || (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && env.DEV_LOGIN_EMAIL && env.DEV_LOGIN_PASSWORD))) {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, _secret || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  let authErr = null;
  if (!_secret) { ({ error: authErr } = await sb.auth.signInWithPassword({ email: env.DEV_LOGIN_EMAIL, password: env.DEV_LOGIN_PASSWORD })); }
  if (authErr) {
    supabaseStatus = `auth failed: ${authErr.message}`;
  } else {
    const path = `cities/${slug}/${filename}`;
    const contentType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    const { error: upErr } = await sb.storage.from("city-images").upload(path, bytes, { contentType, upsert: true });
    if (upErr) {
      supabaseStatus = `upload failed: ${upErr.message}`;
    } else {
      publicUrl = sb.storage.from("city-images").getPublicUrl(path).data.publicUrl;
      const { error: updErr } = await sb.from("cities").update({ hero_image: publicUrl }).eq("name", name);
      supabaseStatus = updErr ? `update failed: ${updErr.message}` : "ok";
    }
  }
}

// ── Override map ──────────────────────────────────────────────────────────
const plannerSrc = await readFile(plannerDataPath, "utf8");
const marker = "export const CITY_IMAGE_QUERY_OVERRIDES = {";
const startIdx = plannerSrc.indexOf(marker);
const closeIdx = plannerSrc.indexOf("};", startIdx);
if (startIdx === -1 || closeIdx === -1) { console.error("Override map not found"); process.exit(1); }
const before = plannerSrc.slice(0, startIdx + marker.length);
const block = plannerSrc.slice(startIdx + marker.length, closeIdx);
const after = plannerSrc.slice(closeIdx);
const entries = new Map();
for (const line of block.split("\n")) {
  const m = line.match(/^\s*"((?:[^"\\]|\\.)*)":\s*"((?:[^"\\]|\\.)*)",?\s*$/);
  if (m) entries.set(m[1].replace(/\\(.)/g, "$1"), m[2].replace(/\\(.)/g, "$1"));
}
entries.set(name, query);
const sorted = [...entries.entries()].sort(([a], [b]) => a.localeCompare(b));
const rebuilt = "\n" + sorted.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n") + "\n";
await writeFile(plannerDataPath, before + rebuilt + after);

console.log(`Local:    ${localSrc}`);
console.log(`Supabase: ${supabaseStatus}${publicUrl ? ` -> ${publicUrl}` : ""}`);
console.log(`Override: ${JSON.stringify(name)} -> ${JSON.stringify(query)}`);

function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 110);
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
