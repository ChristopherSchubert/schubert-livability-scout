// lib/measurers/snowfall.js — annual snowfall from NOAA NCEI 1991-2020
// US Climate Normals (annual/seasonal product).
//
// Why this exists separately from the climate measurer: NASA POWER (MERRA-2),
// which provides our other climate fields, has no daily snowfall. NCEI's
// 1991-2020 normals carry `ANN-SNOW-NORMAL` (inches/year) per station,
// aggregated by NOAA from station observations — the canonical US source.
// Free, no key. US-only (foreign cities will return null, which is correct).
//
// Strategy:
//   1. Lazy-load + cache the NCEI inventory_30yr.txt (~1.3 MB, fixed-width).
//   2. For a city's (lat, lon), sort all stations by haversine distance.
//   3. Walk the nearest candidates within a radius cap, fetch each station's
//      per-station CSV, pick the first one with a non-empty ANN-SNOW-NORMAL.
//      Some stations report only temp/precip; skip those.
//   4. Cache per-station CSV responses in module scope so a backfill run
//      doesn't re-fetch the same station 10× for nearby cities.
//
// Returns `snowfall_in_yr` (inches/year, integer) with meta = station id +
// name + distance to the heart pin in km, so the source is auditable per city.

const INVENTORY_URL = "https://www.ncei.noaa.gov/data/normals-annualseasonal/1991-2020/doc/inventory_30yr.txt";
const STATION_CSV = (id) => `https://www.ncei.noaa.gov/data/normals-annualseasonal/1991-2020/access/${id}.csv`;
const SOURCE = "NOAA NCEI 1991-2020 US Climate Normals (annual)";
const SOURCE_URL = "https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals";

// Max station distance we'll accept. Beyond this, snow normals from a
// far-off station don't describe the city's microclimate honestly — better
// to return null than to project Buffalo's snow onto a coastal town 200 km
// south of it.
const MAX_STATION_KM = 60;
// How many nearest stations to try before giving up on a city. Most cities
// resolve in 1–3 tries; airport stations almost always carry snow normals.
const MAX_CANDIDATES = 12;

let _inventory = null;
const _stationCache = new Map();

function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// inventory_30yr.txt is whitespace-delimited:
//   STATION  LAT  LON  ELEV  STATE  NAME (NAME may contain spaces)
// e.g. "USW00094728  40.7789  -73.9692  39.6 NY NEW YORK CNTRL PK TWR"
async function loadInventory() {
  if (_inventory) return _inventory;
  const resp = await fetch(INVENTORY_URL);
  if (!resp.ok) throw new Error(`NCEI inventory HTTP ${resp.status}`);
  const text = await resp.text();
  const out = [];
  for (const line of text.split("\n")) {
    if (line.length < 50) continue;
    // Split on whitespace, take the first 5 tokens, leave the rest as NAME.
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    const id = parts[0];
    const lat = Number(parts[1]);
    const lon = Number(parts[2]);
    const state = parts[4];
    const name = parts.slice(5).join(" ");
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({ id, lat, lon, state, name });
  }
  _inventory = out;
  return _inventory;
}

// Parse one station's CSV header → indexed columns; pull the ANN-SNOW-NORMAL
// from row 2 (the only data row in a normals file). Returns null if the
// column exists but the cell is blank.
function extractAnnSnow(csvText) {
  const newline = csvText.indexOf("\n");
  if (newline < 0) return null;
  const headerLine = csvText.slice(0, newline);
  const dataLine = csvText.slice(newline + 1, csvText.indexOf("\n", newline + 1) >>> 0 || csvText.length);
  const headers = parseCsvRow(headerLine);
  const idx = headers.indexOf("ANN-SNOW-NORMAL");
  if (idx < 0) return null;
  const cells = parseCsvRow(dataLine);
  const raw = cells[idx];
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  // NCEI uses -9999 / -7777 / -6666 as sentinels for missing data.
  if (!Number.isFinite(n) || n < -1) return null;
  return n;
}

// Minimal CSV row parser — handles quoted fields with commas inside. NCEI
// quotes every string cell, so a naive split(",") would corrupt the NAME.
function parseCsvRow(line) {
  const out = [];
  let cur = "", inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuote = false;
      else cur += ch;
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

async function fetchStation(id) {
  if (_stationCache.has(id)) return _stationCache.get(id);
  const resp = await fetch(STATION_CSV(id));
  if (!resp.ok) {
    _stationCache.set(id, null);
    return null;
  }
  const text = await resp.text();
  _stationCache.set(id, text);
  return text;
}

export default {
  id: "snowfall",
  describe: "Annual snowfall from NOAA NCEI 1991-2020 US Climate Normals",
  needs: ["lat", "lon"],
  writes: {
    measuredMetrics: ["snowfall_in_yr"],
  },
  // NCEI is generous (single station CSV is ~80 KB) but we still pause so a
  // full-corpus backfill doesn't look like a scraper.
  throttleMs: 500,
  async run({ lat, lon, asOf }) {
    const inv = await loadInventory();
    const ranked = inv
      .map((s) => ({ ...s, distKm: haversineKm(lat, lon, s.lat, s.lon) }))
      .filter((s) => s.distKm <= MAX_STATION_KM)
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, MAX_CANDIDATES);
    if (!ranked.length) {
      return { notes: `no NCEI station within ${MAX_STATION_KM} km` };
    }
    for (const station of ranked) {
      const csv = await fetchStation(station.id);
      if (!csv) continue;
      const snowIn = extractAnnSnow(csv);
      if (snowIn == null) continue;
      const value = Math.round(snowIn);
      return {
        measuredMetrics: {
          snowfall_in_yr: {
            value,
            asOf,
            source: SOURCE,
            sourceUrl: SOURCE_URL,
            meta: {
              station_id: station.id,
              station_name: station.name,
              dist_km: Math.round(station.distKm * 10) / 10,
            },
          },
        },
        notes: `${value} in/yr (${station.name}, ${station.distKm.toFixed(1)} km)`,
      };
    }
    return { notes: `no ANN-SNOW-NORMAL among ${ranked.length} nearby stations` };
  },
};
