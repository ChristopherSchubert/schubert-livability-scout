// scripts/demote-tiny-images.mjs
//
// Second curation pass over the manifest. The first pass (curate-images.mjs)
// re-ranked choices by title, which is the right primary signal — but it
// doesn't catch a file whose title is great but whose actual pixels are
// 286×180. Those tiny files look fine on funnel cards but blur/squash on
// the hero panel where they get stretched to 460px tall.
//
// This pass reads actual pixel dimensions for each choice's local file
// and demotes anything under MIN_WIDTH. Files >= MIN_WIDTH keep their
// title-order; tiny files sink to the bottom of the choices array. The
// primary `images[query]` map updates to the new first choice.
//
// Run with: node scripts/demote-tiny-images.mjs

import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readImageManifest, writeImageManifest } from "../lib/image-manifest.js";

const MIN_WIDTH = 800;
const MIN_HEIGHT = 500;
const repoRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const publicRoot = join(repoRoot, "public");

// Read width/height from the file header. Supports PNG and JPEG, the two
// formats actually present in /assets/images. Returns null if the file
// can't be opened or the format isn't recognized.
async function readImageSize(absPath) {
  let buf;
  try {
    buf = await readFile(absPath);
  } catch {
    return null;
  }
  // PNG: signature is 89 50 4E 47, then IHDR at byte 16 with width/height
  // as big-endian 32-bit ints at offset 16, 20.
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504E47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: walk segments looking for SOFn (0xC0-0xCF, except DHT/DAC/DNL/DRI).
  if (buf.length >= 4 && buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xFF) return null;
      const marker = buf[i + 1];
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        // Start-of-Frame: length(2) + bits(1) + height(2) + width(2)
        const height = buf.readUInt16BE(i + 5);
        const width  = buf.readUInt16BE(i + 7);
        return { width, height };
      }
      const segLen = buf.readUInt16BE(i + 2);
      i += 2 + segLen;
    }
  }
  return null;
}

function localPathFor(src) {
  // Manifest stores choices as "./assets/..." but they're served from
  // /public/assets/... at runtime. Normalize and resolve to disk.
  const cleaned = String(src || "").replace(/^\.\//, "").replace(/^\//, "");
  return join(publicRoot, cleaned);
}

const manifest = await readImageManifest();
const choices = manifest.choices || {};
const images = manifest.images || {};

let queryCount = 0;
let demotedFiles = 0;
let promotedQueries = 0;
const promotionExamples = [];

for (const [query, list] of Object.entries(choices)) {
  if (!Array.isArray(list) || list.length === 0) continue;
  queryCount += 1;

  // Get actual dimensions per choice; treat missing files as "unknown" (kept neutral).
  const annotated = await Promise.all(list.map(async (choice, index) => {
    if (!choice?.src || !/^\.?\/assets\//.test(choice.src)) return { choice, index, tiny: false, size: null };
    const localPath = localPathFor(choice.src);
    const exists = await stat(localPath).then(() => true).catch(() => false);
    if (!exists) return { choice, index, tiny: false, size: null };
    const dims = await readImageSize(localPath);
    if (!dims) return { choice, index, tiny: false, size: null };
    const tiny = dims.width < MIN_WIDTH || dims.height < MIN_HEIGHT;
    if (tiny) demotedFiles += 1;
    return { choice, index, tiny, size: dims };
  }));

  // Stable sort: non-tiny first (preserving title order), then tiny.
  annotated.sort((a, b) => {
    if (a.tiny === b.tiny) return a.index - b.index;
    return a.tiny ? 1 : -1;
  });

  const reordered = annotated.map((entry) => entry.choice);
  if (reordered[0].src !== list[0].src) {
    promotedQueries += 1;
    if (promotionExamples.length < 10) {
      const before = annotated.find((entry) => entry.index === 0);
      const after = annotated[0];
      promotionExamples.push({
        query,
        before: { title: list[0].title, size: before?.size },
        after:  { title: reordered[0].title, size: after?.size },
      });
    }
  }

  choices[query] = reordered;
  images[query] = reordered[0].src;
}

await writeImageManifest({ images, choices });

console.log(`Scanned ${queryCount} image groups.`);
console.log(`Demoted ${demotedFiles} files under ${MIN_WIDTH}×${MIN_HEIGHT}.`);
console.log(`Promoted a new #1 in ${promotedQueries} groups.`);
console.log("Sample promotions:");
for (const sample of promotionExamples) {
  const beforeSize = sample.before.size ? `${sample.before.size.width}×${sample.before.size.height}` : "unknown";
  const afterSize  = sample.after.size  ? `${sample.after.size.width}×${sample.after.size.height}`  : "unknown";
  console.log(`  · ${sample.query.slice(0, 64)}…`);
  console.log(`      before: [${beforeSize}] ${sample.before.title}`);
  console.log(`      after:  [${afterSize}] ${sample.after.title}`);
}
