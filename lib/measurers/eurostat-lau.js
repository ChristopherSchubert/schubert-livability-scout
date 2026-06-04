// lib/measurers/eurostat-lau.js — EU-side `core_density` from Eurostat GISCO LAU.
//
// The realness axis is filled by `census` (US Census ACS, tract-level) for US
// cities. ACS has no EU equivalent, so EU cities currently land with the
// realness slot empty. This measurer fills the most universally-available
// slice — population density — using Eurostat's annual LAU release, which
// covers every EU municipality.
//
// Granularity caveat: the value here is whole-LAU density, not "best 700 m
// cluster" the US tract pipeline picks. The envelope records that in
// meta.granularity so the detail page can flag it honestly. For a like-for-
// like comparison we'd need to sample the GEOSTAT 1 km grid inside the stay
// zone; that's a follow-up, parked because it requires a ~100 MB spatial
// download and per-cell lookup.
//
// Self-skip on US cities — the census measurer already wrote core_density
// there, and Eurostat LAU obviously doesn't cover US territory.

import { reverseGeocodeToLau, lookupLau, LAU_VINTAGE } from "../eu-data.js";

const SOURCE = `Eurostat GISCO LAU ${LAU_VINTAGE}`;
const SOURCE_URL = "https://ec.europa.eu/eurostat/web/nuts/local-administrative-units";

// 1 km² = 0.38610216 mi² → people/km² × 2.589988 = people/sq mi
const KM2_PER_SQMI = 2.589988;

export default {
  id: "eurostat_lau",
  describe: "Eurostat GISCO LAU population + density (EU municipalities)",
  needs: ["lat", "lon"],
  writes: {
    measuredMetrics: ["core_density"],
    columns: ["eu_lau"],
  },
  // Nominatim asks for ≤1 req/sec. The helper does one reverse call per run().
  throttleMs: 1200,
  async run({ lat, lon, asOf }) {
    let geo;
    try {
      geo = await reverseGeocodeToLau(lat, lon);
    } catch (e) {
      return { notes: `nominatim error: ${e.message}` };
    }
    if (!geo) return { notes: "no reverse-geocode result" };
    if (geo.countryCode === "US") {
      return { notes: `US (${geo.lauName || "?"}) — handled by census measurer` };
    }
    const lau = await lookupLau(geo.countryCode, geo.lauId);
    if (!lau) {
      return { notes: `no LAU row for ${geo.countryCode}-${geo.lauId} (${geo.lauName || "?"})` };
    }
    const densSqmi = lau.pop_dens_2021 != null ? Math.round(lau.pop_dens_2021 * KM2_PER_SQMI) : null;
    const measuredMetrics = {};
    if (densSqmi != null) {
      measuredMetrics.core_density = {
        value: densSqmi,
        asOf,
        source: SOURCE,
        sourceUrl: SOURCE_URL,
        meta: {
          lau_id: lau.gisco_id,
          lau_name: lau.lau_name,
          pop_2021: lau.pop_2021,
          area_km2: lau.area_km2,
          granularity: "lau",
        },
      };
    }
    const columns = {
      eu_lau: {
        gisco_id: lau.gisco_id,
        country_code: lau.cntr_code,
        lau_id: lau.lau_id,
        lau_name: lau.lau_name,
        pop_2021: lau.pop_2021,
        pop_dens_per_km2: lau.pop_dens_2021,
        area_km2: lau.area_km2,
        asOf,
        source: SOURCE,
        sourceUrl: SOURCE_URL,
      },
    };
    const notes = `LAU ${lau.gisco_id} "${lau.lau_name}" pop ${lau.pop_2021} area ${lau.area_km2?.toFixed(1)} km² → ${densSqmi}/sqmi`;
    return { measuredMetrics, columns, notes };
  },
};
