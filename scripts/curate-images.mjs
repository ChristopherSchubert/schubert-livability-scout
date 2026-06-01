// scripts/curate-images.mjs
//
// Title-based curation pass over the image manifest. For every query
// (hero, stay zone, focus area, ...), score the 5 candidate choices using
// heuristics that favor "this is a public place in this city" titles and
// demote signs, statues, ads, and generic Wikipedia-numbered photos.
// Reorders the choices array so the best title surfaces as #1 and updates
// the primary `images` map so the UI's resolver picks it.
//
// Run with: node scripts/curate-images.mjs
//
// Non-destructive: original choices are preserved, only re-ordered.

import { readImageManifest, writeImageManifest } from "../lib/image-manifest.js";

// ---------------- scoring ----------------

const STRONG_POSITIVES = [
  /\bmain (street|st\.?)\b/i,
  /\bdown(town)?\b/i,
  /\bold town\b/i,
  /\bpromenade\b/i,
  /\bwaterfront\b/i,
  /\bharbor\b/i,
  /\bharbour\b/i,
  /\bpier\b/i,
  /\bsquare\b/i,
  /\bplaza\b/i,
  /\bboardwalk\b/i,
  /\bcity hall\b/i,
];

const MEDIUM_POSITIVES = [
  /\bpanorama(?:s|io)?\b/i,
  /\bskyline\b/i,
  /\boverlook\b/i,
  /\baerial\b/i,
  /\bview from\b/i,
  /\bhistoric (district|downtown)\b/i,
];

const STREET_PATTERN = /\b[A-Z][a-zA-Z]+\s+(?:st\.?|street|ave\.?|avenue|blvd\.?|boulevard|rd\.?|road)\b/i;

const STRONG_NEGATIVES = [
  /\battorney\b/i,
  /\blawyer\b/i,
  /\blaw office\b/i,
  /\bdui\b/i,
  /\bwrongful death\b/i,
  /\binjury\b/i,
  /\binsurance\b/i,
  /\bcompany logo\b/i,
];

const MEDIUM_NEGATIVES = [
  /\bstatue\b/i,
  /\bmonument\b/i,
  /\bsign(?:age)?\b/i,
  /\bbillboard\b/i,
  /\bplaque\b/i,
  /\bsculpture\b/i,
  /\bgrave\b/i,
  /\bcemetery\b/i,
];

const SOFT_NEGATIVES = [
  /\(\s*\d+\s*views?\s*\)/i, // " ( 3 Views )"
  /from google image res/i,
  /google maps/i,
  /screenshot/i,
];

const GENERIC_WIKI_PATTERN = /^[^,]+,\s+[A-Z]+\s+USA\s*\d*$/i; // "Santa Barbara, California, USA8"

function cityNameTokens(query) {
  // queries look like: "Ventura, CA downtown main street public life..."
  const head = query.split(/\s+(downtown|main|street|public|life|color|photo)/i)[0];
  const match = head.match(/^([^,]+),\s*[A-Z]{2}/);
  if (!match) return [];
  return match[1].split(/[\s/]+/).filter(Boolean);
}

function scoreTitle(title, query) {
  if (!title) return 0;
  let score = 0;
  const cityTokens = cityNameTokens(query);
  cityTokens.forEach((token) => {
    if (token.length < 3) return;
    const re = new RegExp(`\\b${escapeRegex(token)}\\b`, "i");
    if (re.test(title)) score += 25;
  });

  STRONG_POSITIVES.forEach((re) => { if (re.test(title)) score += 35; });
  MEDIUM_POSITIVES.forEach((re) => { if (re.test(title)) score += 20; });
  if (STREET_PATTERN.test(title)) score += 15;

  STRONG_NEGATIVES.forEach((re) => { if (re.test(title)) score -= 120; });
  MEDIUM_NEGATIVES.forEach((re) => { if (re.test(title)) score -= 50; });
  SOFT_NEGATIVES.forEach((re) => { if (re.test(title)) score -= 20; });

  if (GENERIC_WIKI_PATTERN.test(title.trim())) score -= 25;

  // Title length — very short or very long titles tend to be junky.
  if (title.length < 6) score -= 10;
  if (title.length > 120) score -= 10;

  return score;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------- driver ----------------

const manifest = await readImageManifest();
const choices = manifest.choices || {};
const images = manifest.images || {};

let queryCount = 0;
let reorderCount = 0;
const examples = [];

for (const [query, list] of Object.entries(choices)) {
  if (!Array.isArray(list) || list.length < 2) continue;
  queryCount += 1;

  const scored = list.map((choice, index) => ({
    choice,
    index,
    score: scoreTitle(choice.title || "", query),
  }));

  // Stable sort by score desc, original index asc on ties.
  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  const reordered = scored.map((entry) => entry.choice);
  const firstChanged = reordered[0].src !== list[0].src;
  if (firstChanged) reorderCount += 1;

  // Capture a sample of meaningful reorders for the report.
  if (firstChanged && examples.length < 12) {
    examples.push({
      query,
      from: { title: list[0].title, score: scored.find((s) => s.index === 0)?.score },
      to:   { title: reordered[0].title, score: scored[0].score },
    });
  }

  choices[query] = reordered;
  images[query] = reordered[0].src;
}

await writeImageManifest({ images, choices });

console.log(`Curated ${queryCount} image groups; promoted a new #1 in ${reorderCount}.`);
console.log("Sample promotions:");
for (const sample of examples) {
  console.log(`  · ${sample.query.slice(0, 64)}…`);
  console.log(`      before: [${sample.from.score}] ${sample.from.title}`);
  console.log(`      after:  [${sample.to.score}] ${sample.to.title}`);
}
