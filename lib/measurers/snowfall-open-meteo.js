// lib/measurers/snowfall-open-meteo.js — pan-global snowfall fallback when
// NOAA NCEI didn't have a nearby station (which is always the case outside
// the US, and occasionally inside it).
//
// Open-Meteo's archive API serves daily `snowfall_sum` (cm) globally from
// ERA5 reanalysis — free, no key, well-documented. We sum 2019-2023 to match
// the same window the climate measurer uses, divide by 5 for mean annual,
// convert cm → inches to land in the same `snowfall_in_yr` envelope shape as
// the NOAA path so chips and the detail page render identically regardless
// of which source filled the cell.
//
// Registered AFTER `snowfall` (NOAA NCEI). The runner skips populated
// outputs, so on US cities NOAA wins (~73/78 today); Open-Meteo only runs
// where NOAA returned no-output. On EU cities NOAA has no candidates → this
// measurer fills.
//
// Granularity / honesty note: ERA5 is a ~0.25° reanalysis grid, so the
// reported snowfall reflects a ~25 km cell around the city, not the city
// itself. For Bled (Alpine basin) this is good — the cell is alpine; for a
// city right on a sharp climate boundary it would smooth things out.
// Recorded in meta.source so future readers can audit.

const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const SOURCE = "Open-Meteo archive (ERA5) 2019-2023";
const SOURCE_URL = "https://open-meteo.com/en/docs/historical-weather-api";
const START = "2019-01-01";
const END = "2023-12-31";
const CM_PER_IN = 0.393701;

export default {
  id: "snowfall_open_meteo",
  describe: "Mean annual snowfall from Open-Meteo (ERA5) — global fallback when NOAA NCEI has no nearby station",
  needs: ["lat", "lon"],
  writes: {
    measuredMetrics: ["snowfall_in_yr"],
  },
  // Open-Meteo's published limit is ~10 req/s for the free tier; one request
  // per city, padded to be conservative.
  throttleMs: 400,
  async run({ lat, lon, asOf }) {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      start_date: START,
      end_date: END,
      daily: "snowfall_sum",
      timezone: "auto",
    });
    let resp, json;
    try {
      resp = await fetch(`${ARCHIVE_URL}?${params}`);
      if (!resp.ok) return { notes: `open-meteo HTTP ${resp.status}` };
      json = await resp.json();
    } catch (e) {
      return { notes: `open-meteo error: ${e.message}` };
    }
    const days = json?.daily?.snowfall_sum;
    if (!Array.isArray(days) || days.length === 0) {
      return { notes: "open-meteo returned no daily array" };
    }
    // ERA5 reports null for cells without data; treat null as 0 cm only if the
    // surrounding context has values, otherwise it's a no-data day and stays
    // out of the sum. Simpler: filter nulls, sum, divide by 5 years.
    const valid = days.filter((v) => Number.isFinite(v));
    if (valid.length < 365 * 4) {
      // <4 full years of data — refuse rather than report a low-confidence number.
      return { notes: `open-meteo returned only ${valid.length} valid days` };
    }
    const totalCm = valid.reduce((s, v) => s + v, 0);
    const meanAnnualCm = totalCm / 5;
    const inYr = Math.round(meanAnnualCm * CM_PER_IN);
    return {
      measuredMetrics: {
        snowfall_in_yr: {
          value: inYr,
          asOf,
          source: SOURCE,
          sourceUrl: SOURCE_URL,
          meta: {
            mean_annual_cm: Math.round(meanAnnualCm),
            n_days_valid: valid.length,
            window: "2019-2023",
            grid: "ERA5 ~25km",
          },
        },
      },
      notes: `${inYr} in/yr (Open-Meteo ERA5, ${Math.round(meanAnnualCm)} cm/yr)`,
    };
  },
};
