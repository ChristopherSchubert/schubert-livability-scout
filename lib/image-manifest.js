import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { createClient } from "@supabase/supabase-js";

const STORAGE_BUCKET = "city-images";

const rootPath = process.cwd();
const publicRootPath = join(rootPath, "public");
const imageRootPath = join(publicRootPath, "assets/images");
const manifestPath = join(imageRootPath, "manifest.js");
const userAgent = "LivabilityScout/2.0 local image helper";
// Single hero per city — user picks the best image they can find, including
// pasted URLs from any source. Don't gatekeep aggressively: 800×450 (720p-ish)
// upscales to ~1.65× in the hero panel — fine for a personal planning tool.
const MIN_IMAGE_WIDTH = 800;
const MIN_IMAGE_HEIGHT = 450;

export function normalizeSrc(value) {
  if (!value) return "";
  return String(value).replace(/^\.\/assets\//, "/assets/");
}

export function denormalizeSrc(value) {
  if (!value) return "";
  return String(value).replace(/^\/assets\//, "./assets/");
}

export function normalizeChoice(choice) {
  if (!choice) return null;
  if (typeof choice === "string") return { src: normalizeSrc(choice), title: "" };
  return {
    ...choice,
    src: normalizeSrc(choice.src),
  };
}

export function normalizeChoices(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(normalizeChoice).filter((choice) => choice?.src);
  }
  const choice = normalizeChoice(value);
  return choice?.src ? [choice] : [];
}

export async function readImageManifest() {
  const source = await readFile(manifestPath, "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  const rawImages = sandbox.window.CITY_TRIAL_IMAGES || {};
  const rawChoices = sandbox.window.CITY_TRIAL_IMAGE_CHOICES || {};
  return {
    images: Object.fromEntries(Object.entries(rawImages).map(([key, value]) => [key, normalizeSrc(value)])),
    choices: Object.fromEntries(Object.entries(rawChoices).map(([key, value]) => [key, normalizeChoices(value)])),
  };
}

export async function writeImageManifest(manifest) {
  const images = Object.fromEntries(
    Object.entries(manifest.images || {}).map(([key, value]) => [key, denormalizeSrc(value)]),
  );
  const choices = Object.fromEntries(
    Object.entries(manifest.choices || {}).map(([key, value]) => [
      key,
      normalizeChoices(value).map((choice) => ({ ...choice, src: denormalizeSrc(choice.src) })),
    ]),
  );
  const source = `window.CITY_TRIAL_IMAGES = ${JSON.stringify(images, null, 2)};\nwindow.CITY_TRIAL_IMAGE_CHOICES = ${JSON.stringify(choices, null, 2)};\n`;
  await writeFile(manifestPath, source);
}

export async function imageSearch(query, page, cityName) {
  if (!query.trim()) throw new Error("Enter search terms first.");
  // Unsplash leads — magazine-tier travel photography. Openverse and Commons
  // fall in behind as broader-coverage fallbacks for places Unsplash misses.
  const candidates = [
    ...await unsplashSearch(query, page),
    ...await openverseSearch(query, page),
    ...await commonsSearch(query, page),
  ];

  // If the user's query already mentions the city, trust the query and skip
  // the redundant per-candidate city-match check. Otherwise the filter
  // rejects perfectly relevant photos whose title is just the subject
  // (e.g. "Funk Zone") when the search itself was "Funk Zone, Santa Barbara".
  const queryCityCovered = cityName && queryMentionsCity(query, cityName);

  const seen = new Set();
  const results = [];
  for (const candidate of candidates) {
    const key = candidate.imageUrl;
    if (!key || seen.has(key) || isBadCandidate(candidate.title, key)) continue;
    if (cityName && !queryCityCovered && !candidateMatchesCity(candidate, cityName)) continue;
    seen.add(key);
    if (!passesResolutionHint(candidate)) continue;
    const verification = await verifyImageCandidate(candidate.imageUrl);
    if (!verification.ok) continue;
    const { matchText, ...result } = candidate;
    results.push({
      ...result,
      thumb: result.thumb || result.imageUrl,
      width: verification.width,
      height: verification.height,
    });
    if (results.length >= 5) break;
  }
  return results;
}

/**
 * Save a hero image. One image per city — no slot system, no choices array.
 *
 * Filename is content-addressable: sha256(bytes).slice(0,12).<ext>. New
 * bytes always produce a new URL, so browsers fetch fresh without any
 * cache-bust query string. Any pre-existing files in the folder are pruned
 * after a successful write so each city's hero folder holds exactly one
 * file matching the active manifest entry.
 */
export async function saveImageSelection({ key, folder, candidate }) {
  const manifest = await readImageManifest();
  const cleanKey = requireText(key, "Missing image key.");
  const safeFolderPath = safeImageFolder(folder);
  const normalizedCandidate = normalizeCandidate(candidate);
  const bytes = await downloadImage(normalizedCandidate.imageUrl);
  assertMinimumResolution(bytes, normalizedCandidate);
  const hash = createHash("sha256").update(bytes).digest("hex");

  await mkdir(join(imageRootPath, safeFolderPath), { recursive: true });
  const src = await writeHero(safeFolderPath, hash, bytes);
  manifest.images[cleanKey] = src;
  // Drop legacy choices entry — single-image model has no place for it.
  if (manifest.choices && manifest.choices[cleanKey]) delete manifest.choices[cleanKey];
  await writeImageManifest(manifest);
  return { selectedSrc: src, manifestSrc: src };
}

/**
 * Save a chosen hero into Supabase Storage (the deploy-safe, multi-user path).
 * Downloads the bytes server-side (no CORS), uploads to the public
 * `city-images` bucket at cities/<slug>/<hash>.<ext>, returns the public URL.
 * Uploads run as the calling user (their access token) under storage RLS.
 */
export async function saveImageToStorage({ slug, candidate, accessToken }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing on the server.");
  if (!slug) throw new Error("Missing city slug.");

  const cand = normalizeCandidate(candidate);
  const bytes = await downloadImage(cand.imageUrl);
  assertMinimumResolution(bytes, cand);
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const ext = extensionFor(bytes);
  const path = `cities/${slug}/${hash}${ext}`;
  const contentType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {},
  });

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, bytes, {
    contentType, upsert: true,
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return { selectedSrc: data.publicUrl, manifestSrc: data.publicUrl, width: cand.width, height: cand.height };
}

function normalizeCandidate(candidate) {
  if (!candidate?.imageUrl) throw new Error("Missing image result URL.");
  return {
    title: String(candidate.title || "Search result image"),
    source: String(candidate.source || "Image result"),
    imageUrl: String(candidate.imageUrl),
    thumb: String(candidate.thumb || candidate.imageUrl),
    landingUrl: String(candidate.landingUrl || ""),
    width: Number(candidate.width || 0),
    height: Number(candidate.height || 0),
  };
}

function requireText(value, message) {
  const text = String(value || "").trim();
  if (!text) throw new Error(message);
  return text;
}

function safeImageFolder(value) {
  const folder = String(value || "").replace(/^\/+/, "");
  if (!/^cities\/[-a-z0-9]+\/(?:hero|stay-zone|focus-areas\/[0-9]{2}-[-a-z0-9]+)$/.test(folder)) {
    throw new Error("Refusing to write outside a city image folder.");
  }
  const resolved = resolve(imageRootPath, folder);
  if (!resolved.startsWith(imageRootPath)) throw new Error("Invalid image folder.");
  return folder;
}

async function writeHero(folder, hash, bytes) {
  const folderPath = join(imageRootPath, folder);
  const extension = extensionFor(bytes);
  const filename = `${hash.slice(0, 12)}${extension}`;
  const targetPath = join(folderPath, filename);
  // Clear any other files first — one image per folder, always.
  const { readdir, unlink } = await import("node:fs/promises");
  const existing = await readdir(folderPath).catch(() => []);
  for (const entry of existing) {
    if (entry !== filename) await unlink(join(folderPath, entry)).catch(() => {});
  }
  await writeFile(targetPath, bytes);
  return `/assets/images/${folder}/${filename}`;
}

function choiceFor(src, candidate, query) {
  return {
    src,
    title: readableTitle(candidate.title || "Saved search result"),
    source: candidate.source || candidate.landingUrl || "Saved search result",
    query,
    width: Number(candidate.width || 0),
    height: Number(candidate.height || 0),
  };
}

async function unsplashSearch(query, page) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) return [];
  for (const variant of queryVariants(query)) {
    const params = new URLSearchParams({
      query: variant,
      page: String(Math.max(1, page)),
      per_page: "20",
      orientation: "landscape",
      content_filter: "high",
    });
    try {
      const response = await fetchWithTimeout(
        `https://api.unsplash.com/search/photos?${params}`,
        12000,
        { Authorization: `Client-ID ${accessKey}`, "Accept-Version": "v1" },
      );
      if (!response.ok) continue;
      const data = await response.json();
      const results = data.results || [];
      if (!results.length) continue;
      return results.map((result) => ({
        title: readableTitle(result.description || result.alt_description || ""),
        source: `Unsplash · ${result.user?.name || "photographer"}`,
        imageUrl: result.urls?.regular || result.urls?.full || "",
        thumb: result.urls?.small || result.urls?.thumb || "",
        landingUrl: result.links?.html || "",
        width: Number(result.width || 0),
        height: Number(result.height || 0),
        matchText: `${result.description || ""} ${result.alt_description || ""} ${(result.tags || []).map((tag) => tag.title).join(" ")} ${result.user?.location || ""}`,
      }));
    } catch {
      // try next variant
    }
  }
  return [];
}

async function openverseSearch(query, page) {
  // Openverse uses strict AND semantics — every word in the query must
  // appear. Long descriptive queries ("X downtown main street public life
  // people color photo") return zero results. Fall back through shorter
  // variants until we get a hit, then trust the downstream city-match and
  // resolution filters to keep things relevant.
  for (const variant of queryVariants(query)) {
    const params = new URLSearchParams({
      q: variant,
      page: String(Math.max(1, page)),
      page_size: "20",
    });
    try {
      const data = await fetchJson(`https://api.openverse.org/v1/images/?${params}`);
      const results = data.results || [];
      if (!results.length) continue;
      return results.map((result) => ({
        title: readableTitle(result.title || ""),
        source: `Openverse ${result.provider || result.source || "image"}`,
        imageUrl: result.url || result.thumbnail || "",
        thumb: result.thumbnail || result.url || "",
        landingUrl: result.foreign_landing_url || "",
        width: Number(result.width || 0),
        height: Number(result.height || 0),
        matchText: `${result.title || ""} ${(result.tags || []).map((tag) => tag.name).join(" ")} ${result.foreign_landing_url || ""}`,
      }));
    } catch {
      // try the next variant
    }
  }
  return [];
}

// Filler words baked into the default queries that backends like Unsplash
// treat as required terms, killing recall. Stripping them when generating
// shorter variants makes "Funk Zone Santa Barbara photo people color" still
// find the "Funk Zone Santa Barbara" matches that actually exist.
const FILLER_WORDS = new Set([
  "color", "photo", "photos", "image", "images",
  "people", "public", "life",
  "outdoor", "dining", "place",
  "scene", "view", "shot",
]);

const STATE_ABBREV = /^(?:[A-Z]{2})$/;

/**
 * Yields progressively shorter, sanitized forms of the query so a strict
 * backend can still return something for long or punctuated search strings.
 *
 * Strategy (most specific → least):
 *   1. Sanitized original (commas/extra whitespace cleaned)
 *   2. Sanitized minus trailing state abbreviation
 *   3. Sanitized minus filler words ("color photo people public life ...")
 *   4. Subject + city (first 2 tokens around a comma split, if present)
 *   5. First 3 substantive words
 *   6. First 2 substantive words
 *
 * Each variant is tried in order; the first one to return results wins.
 */
function queryVariants(query) {
  const raw = String(query || "").trim();
  if (!raw) return [];

  const sanitized = raw.replace(/[,;]+/g, " ").replace(/\s+/g, " ").trim();
  const allWords = sanitized.split(" ").filter(Boolean);
  const dropState = allWords.length > 1 && STATE_ABBREV.test(allWords[allWords.length - 1])
    ? allWords.slice(0, -1)
    : allWords;
  const substantive = dropState.filter((word) => !FILLER_WORDS.has(word.toLowerCase()));

  // Subject + city: the user usually writes "Subject, City State". Split on
  // the original comma and take the first segment (subject) + the second
  // segment minus state.
  let subjectCity = "";
  const commaSplit = raw.split(/,\s*/).filter(Boolean);
  if (commaSplit.length >= 2) {
    const subject = commaSplit[0].trim();
    const cityChunk = commaSplit[1].trim().split(/\s+/).filter((token) => !STATE_ABBREV.test(token)).join(" ");
    subjectCity = `${subject} ${cityChunk}`.trim();
  }

  const variants = new Set();
  if (sanitized) variants.add(sanitized);
  if (dropState.length && dropState.length !== allWords.length) variants.add(dropState.join(" "));
  if (substantive.length && substantive.length !== dropState.length) variants.add(substantive.join(" "));
  if (subjectCity) variants.add(subjectCity);
  if (substantive.length >= 3) variants.add(substantive.slice(0, 3).join(" "));
  if (substantive.length >= 2) variants.add(substantive.slice(0, 2).join(" "));

  return [...variants];
}

async function commonsSearch(query, page) {
  const offset = Math.max(0, (Math.max(1, page) - 1) * 20);
  for (const variant of queryVariants(query)) {
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: variant,
      gsrnamespace: "6",
      gsrlimit: "20",
      gsroffset: String(offset),
      prop: "imageinfo",
      iiprop: "url|mime|size",
      iiurlwidth: "1100",
      format: "json",
      origin: "*",
    });
    try {
      const data = await fetchJson(`https://commons.wikimedia.org/w/api.php?${params}`);
      const pages = Object.values(data.query?.pages || {});
      if (!pages.length) continue;
      return pages
        .sort((a, b) => (a.index || 0) - (b.index || 0))
        .map((item) => {
          const info = item.imageinfo?.[0];
          return {
            title: readableTitle(item.title || ""),
            source: "Wikimedia Commons",
            imageUrl: info?.thumburl || info?.url || "",
            thumb: info?.thumburl || info?.url || "",
            landingUrl: info?.descriptionurl || "",
            width: Number(info?.thumbwidth || info?.width || 0),
            height: Number(info?.thumbheight || info?.height || 0),
            matchText: `${item.title || ""} ${info?.descriptionurl || ""}`,
          };
        });
    } catch {
      // try next variant
    }
  }
  return [];
}

async function fetchJson(url) {
  try {
    const response = await fetchWithTimeout(url, 12000);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch {
    return JSON.parse(downloadTextWithCurl(url));
  }
}

async function fetchWithTimeout(url, timeoutMs, extraHeaders = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { "User-Agent": userAgent, ...extraHeaders },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadImage(url) {
  try {
    const response = await fetchWithTimeout(url, 15000);
    if (!response.ok) throw new Error(`Could not download image: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!isImageBytes(bytes)) throw new Error("Downloaded result was not a usable image file.");
    return bytes;
  } catch {
    const bytes = downloadBytesWithCurl(url);
    if (!isImageBytes(bytes)) throw new Error("Downloaded result was not a usable image file.");
    return bytes;
  }
}

async function verifyImageCandidate(url) {
  try {
    const bytes = await downloadImage(url);
    if (!isImageBytes(bytes)) return { ok: false, width: 0, height: 0 };
    const dimensions = imageDimensions(bytes);
    if (!dimensions) return { ok: false, width: 0, height: 0 };
    return {
      ok: dimensions.width >= MIN_IMAGE_WIDTH && dimensions.height >= MIN_IMAGE_HEIGHT,
      width: dimensions.width,
      height: dimensions.height,
    };
  } catch {
    return { ok: false, width: 0, height: 0 };
  }
}

function isImageBytes(bytes) {
  return bytes?.length && (
    bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    || bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    || bytes.subarray(0, 4).toString() === "RIFF"
  );
}

function extensionFor(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ".png";
  if (bytes.subarray(0, 4).toString() === "RIFF") return ".webp";
  return ".jpg";
}

function passesResolutionHint(candidate) {
  if (!candidate) return false;
  if (!candidate.width || !candidate.height) return true;
  return Number(candidate.width) >= MIN_IMAGE_WIDTH && Number(candidate.height) >= MIN_IMAGE_HEIGHT;
}

function assertMinimumResolution(bytes, candidate) {
  const dimensions = imageDimensions(bytes);
  if (!dimensions) throw new Error("Could not read downloaded image dimensions.");
  if (dimensions.width < MIN_IMAGE_WIDTH || dimensions.height < MIN_IMAGE_HEIGHT) {
    throw new Error(`Image is too small. Minimum is ${MIN_IMAGE_WIDTH}x${MIN_IMAGE_HEIGHT}, got ${dimensions.width}x${dimensions.height}.`);
  }
  candidate.width = dimensions.width;
  candidate.height = dimensions.height;
}

function imageDimensions(bytes) {
  return pngDimensions(bytes) || jpegDimensions(bytes) || webpDimensions(bytes) || null;
}

function pngDimensions(bytes) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) return null;
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function jpegDimensions(bytes) {
  if (bytes.length < 4 || !bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (offset + 3 >= bytes.length) break;
    const size = bytes.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (offset + 8 >= bytes.length) break;
      return {
        width: bytes.readUInt16BE(offset + 7),
        height: bytes.readUInt16BE(offset + 5),
      };
    }
    if (size < 2) break;
    offset += size + 2;
  }
  return null;
}

function webpDimensions(bytes) {
  if (bytes.length < 30 || bytes.subarray(0, 4).toString() !== "RIFF" || bytes.subarray(8, 12).toString() !== "WEBP") return null;
  const chunk = bytes.subarray(12, 16).toString();
  if (chunk === "VP8X") {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  if (chunk === "VP8 ") {
    if (bytes.length < 30) return null;
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    if (bytes.length < 25) return null;
    const value = bytes.readUInt32LE(21);
    return {
      width: (value & 0x3fff) + 1,
      height: ((value >> 14) & 0x3fff) + 1,
    };
  }
  return null;
}

function readableTitle(value) {
  return String(value || "")
    .replace(/^File:/, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replaceAll("_", " ")
    .trim() || "Search result image";
}

function downloadTextWithCurl(url) {
  return execFileSync("curl", curlArgs(url), {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function downloadBytesWithCurl(url) {
  return execFileSync("curl", curlArgs(url), {
    maxBuffer: 50 * 1024 * 1024,
  });
}

function curlArgs(url) {
  return [
    "-L",
    "--compressed",
    "--retry",
    "2",
    "--retry-delay",
    "1",
    "-A",
    userAgent,
    "-s",
    String(url),
  ];
}

function isBadCandidate(title, url) {
  const text = `${title} ${url}`.replaceAll("_", " ");
  return /\.(svg|pdf|tif|tiff)(?:$|[/?#])/i.test(url)
    || /\b(map|painting|diagram|seal|logo|poster|plan|chart|scan|engraving|lithograph|postcard|archive|archives|bw|b&w|black[-\s]?and[-\s]?white|monochrome|sepia|grayscale|grey[-\s]?scale)\b/i.test(text)
    || /\b(flag|cemetery|climate|graph|route|interstate|airport|school|church interior|chapel|nave|mass|memorial plaque|fixture|intercom|box office|motor lodge|travel center|hobby lobby|farm|orchard|ranch|pelican|alligator|grand prix|raceway|stadium|parking lot|police|sheriff|patrol|fire truck|freeway|highway)\b/i.test(text);
}

function queryMentionsCity(query, cityName) {
  const text = String(query || "").toLowerCase();
  const compact = text.replace(/\s+/g, "");
  return cityAliases(cityName).some((alias) => {
    const lowerAlias = alias.toLowerCase();
    if (text.includes(lowerAlias)) return true;
    const compactAlias = lowerAlias.replace(/\s+/g, "");
    return compactAlias.length >= 4 && compact.includes(compactAlias);
  });
}

function candidateMatchesCity(candidate, cityName) {
  // Flickr tags often glue city names together ("santabarbara", "saintpetersburg").
  // Compare both the spaced form and a compact (space-stripped) form so we
  // don't lose otherwise-relevant photos to tag-naming conventions.
  const text = `${candidate.title || ""} ${candidate.matchText || ""} ${candidate.landingUrl || ""}`.replaceAll("_", " ").toLowerCase();
  const compactText = text.replace(/\s+/g, "");
  return cityAliases(cityName).some((alias) => {
    const lowerAlias = alias.toLowerCase();
    if (text.includes(lowerAlias)) return true;
    const compactAlias = lowerAlias.replace(/\s+/g, "");
    return compactAlias.length >= 4 && compactText.includes(compactAlias);
  });
}

function cityAliases(cityName) {
  const base = cityName.replace(/,\s[A-Z]{2}$/, "");
  const aliases = [base];
  if (base === "Monterey / Pacific Grove") aliases.push("Monterey", "Pacific Grove");
  if (base === "St. Petersburg") aliases.push("St Petersburg", "Saint Petersburg", "St Pete", "St. Pete");
  if (base === "St. Augustine") aliases.push("St Augustine", "Saint Augustine");
  if (base === "Carmel-by-the-Sea") aliases.push("Carmel");
  return [...new Set(aliases)];
}

export async function imageFileExists(src) {
  if (!src?.startsWith("/assets/")) return false;
  try {
    const filePath = join(publicRootPath, src.replace(/^\//, ""));
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}
