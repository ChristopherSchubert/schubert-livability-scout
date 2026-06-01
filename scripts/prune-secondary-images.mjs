// scripts/prune-secondary-images.mjs
//
// One-shot cleanup: drop every manifest entry whose key isn't the canonical
// city-hero query, and delete the matching on-disk folders (stay-zone/,
// focus-areas/) so we're left with one hero image per city.
//
// Run with: node scripts/prune-secondary-images.mjs

import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readImageManifest, writeImageManifest } from "../lib/image-manifest.js";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const citiesRoot = join(repoRoot, "public/assets/images/cities");

// Hero query pattern: ends with "downtown main street public life people color photo"
const HERO_PATTERN = /downtown main street public life people color photo$/i;

const manifest = await readImageManifest();
const beforeKeys = Object.keys(manifest.choices || {});
const heroKeys = beforeKeys.filter((key) => HERO_PATTERN.test(key));
const droppedKeys = beforeKeys.filter((key) => !HERO_PATTERN.test(key));

manifest.choices = Object.fromEntries(heroKeys.map((key) => [key, manifest.choices[key]]));
manifest.images = Object.fromEntries(heroKeys.map((key) => [key, manifest.images[key]]).filter(([, v]) => v));
await writeImageManifest(manifest);

console.log(`Pruned manifest: kept ${heroKeys.length} hero entries, dropped ${droppedKeys.length}.`);

// Delete on-disk stay-zone/ and focus-areas/ folders for every city. Hero
// folders are left alone.
const { readdir } = await import("node:fs/promises");
const cities = await readdir(citiesRoot, { withFileTypes: true }).catch(() => []);
let removedDirs = 0;
for (const entry of cities) {
  if (!entry.isDirectory()) continue;
  for (const subdir of ["stay-zone", "focus-areas"]) {
    const path = join(citiesRoot, entry.name, subdir);
    const exists = await stat(path).then(() => true).catch(() => false);
    if (exists) {
      await rm(path, { recursive: true, force: true });
      removedDirs += 1;
    }
  }
}
console.log(`Removed ${removedDirs} on-disk directories.`);
