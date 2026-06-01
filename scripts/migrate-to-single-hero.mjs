// scripts/migrate-to-single-hero.mjs
//
// One-shot migration: per-city hero folders are pruned to a single
// content-addressable file (<sha256-12>.<ext>). Whatever the manifest's
// images[query] currently points at is the chosen hero; everything else
// in the folder is deleted. The manifest.images entry is updated to the
// new content-addressable path; manifest.choices is dropped entirely.
//
// Run once: node scripts/migrate-to-single-hero.mjs

import { createHash } from "node:crypto";
import { readFile, writeFile, readdir, unlink, rename, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { readImageManifest, writeImageManifest } from "../lib/image-manifest.js";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const citiesRoot = join(repoRoot, "public/assets/images/cities");

const manifest = await readImageManifest();
const newImages = {};
let processed = 0;
let renamed = 0;
let prunedFiles = 0;

for (const [key, src] of Object.entries(manifest.images || {})) {
  if (!src?.startsWith("/assets/images/")) continue;
  const localPath = join(repoRoot, "public", src.replace(/^\//, ""));
  const exists = await stat(localPath).then(() => true).catch(() => false);
  if (!exists) {
    console.warn(`  missing: ${src} (key: ${key.slice(0, 60)})`);
    continue;
  }

  const folder = localPath.split("/").slice(0, -1).join("/");
  const bytes = await readFile(localPath);
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const ext = extname(localPath).toLowerCase();
  const newFilename = `${hash}${ext}`;
  const newPath = join(folder, newFilename);

  // Rename the chosen file to its content-addressable name if needed.
  if (newPath !== localPath) {
    await rename(localPath, newPath);
    renamed += 1;
  }

  // Delete every other file in the folder.
  const entries = await readdir(folder);
  for (const entry of entries) {
    if (entry !== newFilename) {
      await unlink(join(folder, entry));
      prunedFiles += 1;
    }
  }

  const newSrc = src.replace(/[^/]+$/, newFilename);
  newImages[key] = newSrc;
  processed += 1;
}

await writeImageManifest({ images: newImages, choices: {} });

console.log(`Processed ${processed} hero entries.`);
console.log(`Renamed ${renamed} files to content-addressable names.`);
console.log(`Pruned ${prunedFiles} extra files.`);
console.log(`manifest.choices dropped (was the 5-slot history).`);
