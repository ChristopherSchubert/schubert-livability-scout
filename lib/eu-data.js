// lib/eu-data.js — Eurostat / pan-EU data helpers, parallel to lib/measure.js.
//
// Right now: GISCO LAU 2021 boundaries CSV (population, density, area for
// every EU municipality) + Nominatim reverse-geocoding to LAU id.
//
// The CSV is ~7 MB and updates roughly yearly, so it's cached on disk under
// scripts/.eurostat-lau-2021.csv (same dot-prefix convention as the existing
// trend / crowd-season caches). Re-fetched only when the cache is missing.
//
// Why GISCO LAU and not Eurostat's ACS-equivalent:
// - GISCO LAU covers every EU municipality (including tiny ones like Bled and
//   Piran). Eurostat's Urban Audit ("urb_*") tables only include ~900 large
//   cities, which excludes most of our likely candidates.
// - The trade-off: LAU pop density is whole-municipality, not the densest
//   walkable cluster the US ACS tract pipeline picks. The envelope carries
//   that caveat in `meta.granularity`.

import fs from "node:fs/promises";
import path from "node:path";

const LAU_CSV_URL = "https://gisco-services.ec.europa.eu/distribution/v2/lau/csv/LAU_RG_01M_2021_4326.csv";
const LAU_CSV_PATH = path.resolve(process.cwd(), "scripts/.eurostat-lau-2021.csv");
const LAU_YEAR = 2021;

let _lauTable = null; // in-process cache: Map<`${CNTR}_${LAU_ID}`, row>

async function ensureLauCsv() {
  try {
    await fs.access(LAU_CSV_PATH);
    return;
  } catch {}
  const r = await fetch(LAU_CSV_URL);
  if (!r.ok) throw new Error(`Eurostat LAU CSV fetch failed: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await fs.writeFile(LAU_CSV_PATH, buf);
}

// Minimal CSV parser tailored to the GISCO file. LAU_NAME may contain commas
// inside double-quotes (e.g. "Piran/Pirano"); LAU_ID is always quoted because
// some are leading-zero strings. The format is otherwise plain.
function parseCsvLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else {
      if (c === ',') { out.push(cur); cur = ""; }
      else if (c === '"') q = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function loadLauTable() {
  if (_lauTable) return _lauTable;
  await ensureLauCsv();
  const text = await fs.readFile(LAU_CSV_PATH, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const need = ["GISCO_ID", "CNTR_CODE", "LAU_ID", "LAU_NAME", "POP_2021", "POP_DENS_2021", "AREA_KM2"];
  for (const k of need) {
    if (idx[k] == null) throw new Error(`Eurostat LAU CSV missing column: ${k}`);
  }
  const table = new Map();
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const cntr = row[idx.CNTR_CODE];
    const lau = row[idx.LAU_ID];
    if (!cntr || !lau) continue;
    table.set(`${cntr}_${lau}`, {
      gisco_id: row[idx.GISCO_ID],
      cntr_code: cntr,
      lau_id: lau,
      lau_name: row[idx.LAU_NAME],
      pop_2021: Number(row[idx.POP_2021]) || null,
      pop_dens_2021: Number(row[idx.POP_DENS_2021]) || null,
      area_km2: Number(row[idx.AREA_KM2]) || null,
    });
  }
  _lauTable = table;
  return table;
}

export async function lookupLau(countryCode, lauId) {
  const t = await loadLauTable();
  return t.get(`${countryCode.toUpperCase()}_${String(lauId)}`) || null;
}

// Reverse-geocode lat/lon through Nominatim and extract the LAU id from the
// ISO 3166-2 subdivision code on whichever admin level Nominatim attaches it
// to (usually lvl8 for municipality; lvl6 in countries that group LAUs into
// provinces). Returns { countryCode, lauId, lauName, displayName, raw }.
// The caller is responsible for any rate limiting beyond the polite throttle.
export async function reverseGeocodeToLau(lat, lon, { userAgent = "livability-scout/1.0" } = {}) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10&addressdetails=1`;
  const r = await fetch(url, { headers: { "User-Agent": userAgent } });
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  const j = await r.json();
  const addr = j.address || {};
  const countryCode = (addr.country_code || "").toUpperCase();
  if (!countryCode) return null;

  // Prefer lvl8 (LAU2 municipality) over lvl6/7 because GISCO's LAU CSV is at
  // municipality granularity. Fall back through the ladder if a country tags
  // its municipalities at a different level.
  let isoLvl = null;
  for (const lvl of ["ISO3166-2-lvl8", "ISO3166-2-lvl7", "ISO3166-2-lvl6"]) {
    if (addr[lvl]) { isoLvl = addr[lvl]; break; }
  }
  if (!isoLvl) return null;
  // ISO format is "CC-XXX" — split off the leading country code.
  const lauId = isoLvl.split("-").slice(1).join("-");
  const lauName = addr.municipality || addr.town || addr.city || addr.village || addr.locality || j.name || null;
  return { countryCode, lauId, lauName, displayName: j.display_name || null, raw: j };
}

export const LAU_VINTAGE = LAU_YEAR;
