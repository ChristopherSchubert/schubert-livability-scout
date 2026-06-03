// lib/chips.js — chip vocabulary + assignment for the city header.
//
// chipsFor(city, corpus?) → string[] of human-readable chip labels.
//
// Rules:
//  • Chips live in groups. Within a group, the most specific firing chip
//    wins (e.g., Peninsula > Coastal > Bayfront).
//  • Across groups, the group priority below decides display order.
//  • Cap at 4 chips so the strip stays readable.
//
// Every chip reads ONLY from measured signals on `cityItem.measuredMetrics`
// (or the visit_climate column reflected onto the cityItem). No fudging.
// If a signal is missing, the chip simply doesn't fire. That's the design.

// Helpers ────────────────────────────────────────────────────────────────
const v = (city, key) => city?.measuredMetrics?.[key]?.value;
const ctx = (city) => v(city, "osm_context") || {};
const ter = (city) => v(city, "terrain") || {};
const cli = (city) => v(city, "climate_extremes") || {};
const adm = (city) => v(city, "admin") || {};
const water = (city) => city?.measuredMetrics?.water_dist_m;

// Specific-beats-generic registry. Each chip declares its group, label, and
// a synchronous test() that returns true if the chip applies. `specificity`
// only matters for ranking within a group. Higher = more specific.
const CHIPS = [
  // ── Water (group: water) ───────────────────────────────────────────────
  {
    id: "island", group: "water", label: "Island", specificity: 50,
    test: (c) => ctx(c).is_island === true,
  },
  {
    id: "peninsula", group: "water", label: "Peninsula", specificity: 40,
    test: (c) => {
      const o = ctx(c);
      return o.coastline_dist_m != null && o.coastline_dist_m <= 5000 &&
        (o.coastline_bearings?.length || 0) >= 2;
    },
  },
  {
    id: "bayfront", group: "water", label: "Bayfront", specificity: 30,
    test: (c) => {
      const w = water(c);
      const name = w?.meta?.name || "";
      return w?.meta?.kind === "sea" && /bay|sound|inlet|cove/i.test(name);
    },
  },
  {
    id: "harbor-town", group: "water", label: "Harbor town", specificity: 28,
    test: (c) => ctx(c).harbour_within_1km === true,
  },
  {
    id: "coastal", group: "water", label: "Coastal", specificity: 20,
    test: (c) => {
      const o = ctx(c);
      const w = water(c);
      // OSM coastline within 5km OR nearest body is "sea"
      return (o.coastline_dist_m != null && o.coastline_dist_m <= 5000) ||
        w?.meta?.kind === "sea";
    },
  },
  {
    id: "riverfront", group: "water", label: "Riverfront", specificity: 15,
    test: (c) => water(c)?.meta?.kind === "river" && water(c)?.value <= 500,
  },
  {
    id: "lakefront", group: "water", label: "Lakefront", specificity: 15,
    test: (c) => water(c)?.meta?.kind === "lake" && water(c)?.value <= 1000,
  },

  // ── Terrain (group: terrain) ───────────────────────────────────────────
  {
    id: "mountain", group: "terrain", label: "Mountain", specificity: 40,
    // City itself is high (≥1500m) — Aspen, Telluride, Park City. Different
    // signal from "Mountain backdrop" — that's the visible skyline view.
    test: (c) => (ter(c).heart_elev_m ?? 0) >= 1500,
  },
  {
    id: "foothills", group: "terrain", label: "Foothills", specificity: 30,
    // High local relief but the city itself is moderate elevation.
    test: (c) => {
      const t = ter(c);
      return (t.relief_10km_m ?? 0) >= 250 && (t.heart_elev_m ?? 0) < 1500;
    },
  },
  {
    id: "valley", group: "terrain", label: "Valley", specificity: 25,
    // The peak nearby rises significantly above the heart — classic valley.
    test: (c) => (ter(c).peak_rise_15km_m ?? 0) >= 400,
  },
  {
    id: "plateau", group: "terrain", label: "Plateau", specificity: 20,
    test: (c) => {
      const t = ter(c);
      return (t.heart_elev_m ?? 0) >= 1200 && (t.relief_10km_m ?? 0) < 200;
    },
  },
  {
    id: "plains", group: "terrain", label: "Plains", specificity: 10,
    test: (c) => {
      const t = ter(c);
      return t.relief_10km_m != null && t.relief_10km_m < 50;
    },
  },
  {
    id: "forested", group: "terrain", label: "Forested", specificity: 12,
    // Separate from elevation — heavy tree cover within 10 km.
    test: (c) => (ctx(c).forest_frac_10km ?? 0) >= 0.30,
  },
  {
    id: "desert", group: "terrain", label: "Desert", specificity: 14,
    test: (c) => (cli(c).annual_precip_in ?? 99) < 10,
  },

  // ── Urban form (group: urban-form) ─────────────────────────────────────
  {
    id: "stroll-grade", group: "urban-form", label: "Stroll-grade", specificity: 30,
    test: (c) => (v(c, "walk_score") ?? 0) >= 85,
  },
  {
    id: "walkable", group: "urban-form", label: "Walkable", specificity: 20,
    test: (c) => (v(c, "walk_score") ?? 0) >= 70,
  },
  {
    id: "pedestrian-street", group: "urban-form", label: "Pedestrian street", specificity: 25,
    test: (c) => (ctx(c).pedestrian_street_m ?? 0) >= 200,
  },
  {
    id: "square-centered", group: "urban-form", label: "Square-centered", specificity: 22,
    test: (c) => ctx(c).place_square_within_1km === true,
  },
  {
    id: "historic-fabric", group: "urban-form", label: "Historic fabric", specificity: 18,
    test: (c) => (ctx(c).historic_count_2km ?? 0) >= 12,
  },
  {
    id: "compact", group: "urban-form", label: "Compact", specificity: 10,
    test: (c) => (v(c, "core_density") ?? 0) >= 8000,
  },

  // ── Public life (group: public-life) ───────────────────────────────────
  {
    id: "college-town", group: "public-life", label: "College town", specificity: 30,
    // University nearby AND not a major metro (proxied by core_density,
    // since we don't yet have city-level population — TODO in admin.js).
    test: (c) => ctx(c).university_within_2km === true &&
      (v(c, "core_density") ?? 0) < 12000,
  },
  {
    id: "tourist-heavy", group: "public-life", label: "Tourist-heavy", specificity: 25,
    test: (c) => (v(c, "seasonal_vac_pct") ?? 0) >= 20,
  },
  {
    id: "year-round", group: "public-life", label: "Year-round", specificity: 20,
    test: (c) => (v(c, "seasonal_vac_pct") ?? 99) < 5,
  },
  {
    id: "cafe-dense", group: "public-life", label: "Café-rich", specificity: 15,
    test: (c) => (v(c, "cafe_n") ?? 0) >= 15,
  },

  // ── Climate — winter (group: climate-winter) ───────────────────────────
  {
    id: "snowy", group: "climate-winter", label: "Snowy", specificity: 30,
    test: (c) => (v(c, "snowfall_in_yr") ?? 0) >= 40,
  },
  {
    id: "real-winter", group: "climate-winter", label: "Real winter", specificity: 25,
    test: (c) => (cli(c).jan_mean_f ?? 99) < 30,
  },
  {
    id: "mild-winter", group: "climate-winter", label: "Mild winter", specificity: 20,
    test: (c) => (cli(c).jan_mean_f ?? -99) >= 45,
  },

  // ── Climate — summer (group: climate-summer) ───────────────────────────
  {
    id: "humid-summer", group: "climate-summer", label: "Humid summer", specificity: 30,
    test: (c) => (cli(c).jul_dewpoint_f ?? -99) >= 68,
  },
  {
    id: "dry-summer", group: "climate-summer", label: "Dry summer", specificity: 25,
    test: (c) => (cli(c).jul_dewpoint_f ?? 99) < 55,
  },
  {
    id: "cool-summer", group: "climate-summer", label: "Cool summer", specificity: 20,
    test: (c) => (cli(c).jul_mean_f ?? 99) < 68,
  },

  // ── Outdoors (group: outdoors) ─────────────────────────────────────────
  {
    id: "trails-out-the-door", group: "outdoors", label: "Trails out the door", specificity: 25,
    test: (c) => ctx(c).hiking_route_within_5km === true,
  },
  {
    id: "skiable", group: "outdoors", label: "Skiable", specificity: 22,
    test: (c) => ctx(c).ski_resort_within_50km === true,
  },
  {
    id: "bikeable", group: "outdoors", label: "Bikeable", specificity: 18,
    test: (c) => (ctx(c).cycleway_km_within_700m ?? 0) >= 2,
  },

  // ── Admin (group: admin) ───────────────────────────────────────────────
  {
    id: "state-capital", group: "admin", label: "State capital", specificity: 30,
    test: (c) => adm(c).state_capital === true,
  },
];

// Group priority for display order — the strip reads left-to-right in this
// sequence. Picked to mirror the felt axes: setting first, then form, then
// rhythm, then climate detail, then admin/outdoors as supporting context.
const GROUP_ORDER = [
  "water",
  "terrain",
  "urban-form",
  "public-life",
  "outdoors",
  "climate-winter",
  "climate-summer",
  "admin",
];

// One chip per group — the most-specific firing chip wins inside the group.
function pickByGroup(city) {
  const winners = new Map(); // group → chip
  for (const chip of CHIPS) {
    if (!chip.test(city)) continue;
    const prev = winners.get(chip.group);
    if (!prev || chip.specificity > prev.specificity) winners.set(chip.group, chip);
  }
  return winners;
}

export function chipsFor(city, { max = 4 } = {}) {
  if (!city) return [];
  const winners = pickByGroup(city);
  const ordered = GROUP_ORDER
    .map((g) => winners.get(g))
    .filter(Boolean);
  return ordered.slice(0, max).map((c) => c.label);
}

// Useful for debugging / chip preview. Returns the full set including the
// rejected within-group candidates so you can see what was beaten by what.
export function chipDebug(city) {
  const winners = pickByGroup(city);
  const wonIds = new Set([...winners.values()].map((c) => c.id));
  const all = [];
  for (const chip of CHIPS) {
    const fired = chip.test(city);
    if (!fired) continue;
    all.push({ id: chip.id, group: chip.group, label: chip.label, won: wonIds.has(chip.id), specificity: chip.specificity });
  }
  return all;
}
