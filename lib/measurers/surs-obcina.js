// lib/measurers/surs-obcina.js — Slovenian občina housing fund metrics
// from SURS PxWeb (Statistical Office of the Republic of Slovenia).
//
// Fills two realness slots that the US-only `census` measurer leaves blank
// for EU cities:
//
//   • owner_occ_pct    — table 0861102, year 2021 (most recent)
//                        owner-occupied dwellings ÷ all occupied dwellings.
//   • seasonal_vac_pct — table 0861110, year 2018 (most recent year with the
//                        full occupancy breakdown — the 2021 registry-based
//                        census only carries the aggregate "unoccupied" row;
//                        seasonal vs purely-vacant is null in 2021).
//                        seasonal/secondary dwellings ÷ all dwellings.
//
// Mixed vintages are honest because each metric envelope carries its own
// `asOf` and `meta.year`. The detail page reads the envelope, not the
// pipeline's run date.
//
// Slovenia-only. We detect by reading the LAU code already on
// prior.core_density.meta.lau_id — eurostat_lau writes "SI_003" / "SI_061" /
// "SI_090" etc. If that envelope isn't there yet or doesn't start with "SI_",
// we no-output rather than guess.

import { queryPxWeb, valueAt, lauToObcina } from "../surs.js";

const SOURCE = "SURS PxWeb (SiStatData)";
const SOURCE_URL = "https://pxweb.stat.si/SiStat/en/Podrocja/Index/189";

const OWNERSHIP_TABLE = "0861102S.px";
const OCCUPANCY_TABLE = "0861110S.px";

async function fetchOwnerOccPct(obcina) {
  const t = await queryPxWeb(OWNERSHIP_TABLE, [
    { code: "OBČINE",          selection: { filter: "item", values: [obcina] } },
    { code: "TIP LASTNIŠTVA",  selection: { filter: "item", values: ["0", "1"] } },
    { code: "LETO",            selection: { filter: "item", values: ["2021"] } },
    { code: "MERITVE",         selection: { filter: "item", values: ["1"] } },
  ]);
  const total = valueAt(t, { "OBČINE": obcina, "TIP LASTNIŠTVA": "0", "LETO": "2021", "MERITVE": "1" });
  const owned = valueAt(t, { "OBČINE": obcina, "TIP LASTNIŠTVA": "1", "LETO": "2021", "MERITVE": "1" });
  if (!total) throw new Error("owner_occ: total is zero");
  return { value: Math.round((owned / total) * 1000) / 10, total, owned, year: 2021 };
}

async function fetchSeasonalVacPct(obcina) {
  const t = await queryPxWeb(OCCUPANCY_TABLE, [
    { code: "OBČINE",          selection: { filter: "item", values: [obcina] } },
    { code: "NASELJENOST",     selection: { filter: "item", values: ["0", "21"] } },
    { code: "VRSTA STAVBE",    selection: { filter: "item", values: ["0"] } },
    { code: "LETO",            selection: { filter: "item", values: ["2018"] } },
    { code: "MERITVE",         selection: { filter: "item", values: ["1"] } },
  ]);
  const total    = valueAt(t, { "OBČINE": obcina, "NASELJENOST": "0",  "VRSTA STAVBE": "0", "LETO": "2018", "MERITVE": "1" });
  const seasonal = valueAt(t, { "OBČINE": obcina, "NASELJENOST": "21", "VRSTA STAVBE": "0", "LETO": "2018", "MERITVE": "1" });
  if (!total) throw new Error("seasonal_vac: total is zero");
  return { value: Math.round((seasonal / total) * 1000) / 10, total, seasonal, year: 2018 };
}

export default {
  id: "surs_obcina",
  describe: "SURS housing fund (Slovenia) — owner-occupancy + seasonal/secondary share by občina",
  needs: ["lat", "lon"],
  writes: {
    measuredMetrics: ["owner_occ_pct", "seasonal_vac_pct"],
  },
  // SURS is generous — one request per metric per city, two POSTs total.
  throttleMs: 600,
  async run({ prior, asOf }) {
    const giscoId = prior?.core_density?.meta?.lau_id;
    const obcina = lauToObcina(giscoId);
    if (!obcina) {
      return { notes: giscoId
        ? `not a Slovenian občina (lau_id=${giscoId})`
        : "no eurostat_lau envelope — run that first" };
    }

    const measuredMetrics = {};
    const notes = [];

    try {
      const oo = await fetchOwnerOccPct(obcina);
      measuredMetrics.owner_occ_pct = {
        value: oo.value,
        asOf,
        source: `${SOURCE} table ${OWNERSHIP_TABLE} (${oo.year})`,
        sourceUrl: SOURCE_URL,
        meta: { obcina, table: OWNERSHIP_TABLE, year: oo.year, total_occupied: oo.total, owner_occupied: oo.owned },
      };
      notes.push(`owner_occ=${oo.value}% (${oo.owned}/${oo.total}, ${oo.year})`);
    } catch (e) {
      notes.push(`owner_occ ERR: ${e.message}`);
    }

    try {
      const sv = await fetchSeasonalVacPct(obcina);
      measuredMetrics.seasonal_vac_pct = {
        value: sv.value,
        asOf,
        source: `${SOURCE} table ${OCCUPANCY_TABLE} (${sv.year})`,
        sourceUrl: SOURCE_URL,
        meta: { obcina, table: OCCUPANCY_TABLE, year: sv.year, total_dwellings: sv.total, seasonal_or_secondary: sv.seasonal },
      };
      notes.push(`seasonal_vac=${sv.value}% (${sv.seasonal}/${sv.total}, ${sv.year})`);
    } catch (e) {
      notes.push(`seasonal_vac ERR: ${e.message}`);
    }

    if (!Object.keys(measuredMetrics).length) {
      return { notes: `surs failed — ${notes.join("; ")}` };
    }
    return { measuredMetrics, notes: notes.join(" | ") };
  },
};
