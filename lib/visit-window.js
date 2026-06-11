// Visit-window + climate logic — extracted from lib/planner-data.js (godfile
// split, #47). Isomorphic: no React, no DB. Operates on a cityItem's
// visitClimate / crowdSeason data; re-exported from planner-data.js so
// existing import paths keep working.

// ── VISIT WINDOW ────────────────────────────────────────────────────────
// "Perfect time to visit" — quantitative climate × qualitative crowd. For
// this project the best visit isn't peak season (which flatters everything).
// We surface two windows worth knowing about:
//   • PRIME      — comfortable weather AFTER the crowds thin (lovely, and
//                  you can actually breathe)
//   • OFF-SEASON — the coldest, quietest stretch — what the town feels like
//                  once the crowds are gone
export const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Visit-window seed: ONLY qualitative `prime` / `offSeason` prose now, as a
// fallback for cities whose row hasn't been notes-edited. Climate normals
// come from the NASA POWER measurer; crowd seasonality from the Google
// Trends measurer (scripts/measure-crowd-season.py). The earlier version of
// this seed carried hand-keyed climate + crowd arrays for two demo cities,
// which violated CLAUDE.md's "no in-source per-city data" rule — those
// values are now in Supabase, measured, with citations.
const visitClimateSeed = {
  "Santa Barbara, CA": {
    notes: {
      prime: "Still warm and dry, but the summer crowds have cleared — the town returns to locals.",
      offSeason: "Mild and quiet — downtown on a gray winter weekday, the locals' version of the town.",
    },
  },
  "Savannah, GA": {
    notes: {
      prime: "The heat and humidity break, the squares are perfect, and the spring-festival crowds are long gone.",
      offSeason: "Cool and damp — do the squares hold their public life, or empty out?",
    },
  },
};

// Drive time from Pittsburgh (PIT) — the owner's home base. A logistical
// fact about the candidate, not a measurement of the place. Stored on the
// city row in Supabase as `drive_hrs_from_pit`: number (hours), the string
// "FLY" (too far to drive sensibly), or null (unknown).
export function formatDriveFromPit(value) {
  if (value == null) return null;
  if (value === "FLY") return "Fly from PIT";
  if (value < 1) return "< 1h drive from PIT";
  // Show one decimal for fractional, integer for whole.
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? `${rounded}` : `${rounded.toFixed(1)}`;
  return `${text}h drive from PIT`;
}

// Comfort 0–5 from a month's climate normals. Smooth distance from an ideal
// outdoor-living profile (daytime high ~74°F, night low ~56°F) so months
// gradate cleanly instead of all maxing out across a flat band — that lets
// genuine shoulder season beat a merely-mild winter month.
//
// The daytime penalty uses feltHigh (NOAA heat index when hot/humid, NWS
// wind chill when cold/windy, dry air temp otherwise) — symmetric in both
// directions. Charleston July: 91°F air, 100°F felt → penalized as 100°F.
// Saranac Lake January: 22°F air, ~13°F felt → penalized as 13°F.
export function monthComfort(m) {
  if (!m || m.hi == null) return null;
  let s = 5;
  const felt = m.feltHigh != null ? m.feltHigh : m.hi;
  s -= Math.abs(felt - 74) / 7;
  if (m.lo != null) s -= Math.abs(m.lo - 56) / 12;
  if (m.precipDays != null) s -= Math.max(0, m.precipDays - 8) / 6;
  if (m.daylightHr != null && m.daylightHr < 10) s -= (10 - m.daylightHr) / 2;
  return Math.max(0, Math.min(5, s));
}

// 12-month comfort series (0–10 per month), aligned with calendar months.
// Null entries are months with no climate data. This is what the city page
// renders as a full year-at-a-glance bar.
export function monthlyComfortScores(cityItem) {
  const vc = cityItem.visitClimate;
  if (!Array.isArray(vc) || vc.length !== 12) return null;
  return vc.map((m) => {
    const c = monthComfort(m);
    return c == null ? null : Math.round(c * 2 * 10) / 10;
  });
}

// "Visit now" — how good THIS month is to visit, with a "don't miss it" boost
// when the next two months trend DOWN. So a city in its prime month (good now,
// dropping fast) ranks above one that's merely fine year-round.
//
// Formula (0–10):
//   base       = this month's comfort
//   urgency    = avg drop into the next 2 months, capped at +2 (0 if rising)
//   visitNow   = base + urgency, clamped 0–10
// Informational, NOT folded into the measured fit.
export function visitNowScore(cityItem, monthIndex) {
  const series = monthlyComfortScores(cityItem);
  if (!series || series[monthIndex] == null) return null;
  const base = series[monthIndex];
  const next1 = series[(monthIndex + 1) % 12];
  const next2 = series[(monthIndex + 2) % 12];
  const drops = [next1, next2].filter((v) => v != null).map((v) => base - v);
  const avgDrop = drops.length ? drops.reduce((a, b) => a + b, 0) / drops.length : 0;
  const urgency = Math.max(0, Math.min(2, avgDrop)); // only downward, capped +2
  return Math.round(Math.min(10, base + urgency) * 10) / 10;
}

// Whole nights between two YYYY-MM-DD dates, or null when either is missing
// or the range is degenerate. Check-in → check-out convention (nights =
// depart − arrive), matching the trip-planner. Pure date math, never faked.
export function tripNights(arrive, depart) {
  if (!arrive || !depart) return null;
  const a = new Date(`${arrive}T00:00:00`);
  const d = new Date(`${depart}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(d.getTime())) return null;
  const nights = Math.round((d - a) / 86400000);
  return nights > 0 ? nights : null;
}

// Returns the full 12-month read plus the two recommended windows, or null
// if the city has no climate data yet (never faked — pipeline fills it).
export function cityVisitWindow(cityItem) {
  const climate = cityItem.visitClimate;       // [12] of {hi,lo,precipDays,daylightHr} | null
  const crowd = cityItem.crowdSeason || [];     // [12] of 0–5 (5 = peak tourist) qualitative
  if (!Array.isArray(climate) || climate.length !== 12 || climate.every((m) => !m)) return null;

  const months = MONTHS.map((name, i) => {
    const comfort = monthComfort(climate[i]);
    const c = Number.isFinite(crowd[i]) ? crowd[i] : null;
    // Prime wants crowds at the SHOULDER (~2.5) — not peak (overrun) and not
    // dead-empty (which signals the place shuts down, the off-season test).
    // Bell around 2.5 rather than monotonic "fewer = better."
    const crowdScore = c == null ? 3 : 5 - Math.abs(c - 2.5) * 1.5;
    const primeFit = comfort == null ? null : comfort * 0.65 + crowdScore * 0.35;
    return { name, idx: i, climate: climate[i], comfort, crowd: c, primeFit };
  });

  const withFit = months.filter((m) => m.primeFit != null);

  // OFF-SEASON first: the coldest month, literally — lowest daytime high.
  // The quietest stretch, when the crowds are gone.
  const offSeason = withFit.slice().sort((a, b) => a.climate.hi - b.climate.hi)[0] || null;

  // PRIME: among genuinely comfortable months, excluding the off-season month
  // so the two windows are always distinct, the best shoulder-season fit.
  const comfortable = withFit.filter((mo) => mo.comfort >= 3.5 && (!offSeason || mo.idx !== offSeason.idx));
  const primePool = comfortable.length ? comfortable : withFit.filter((mo) => !offSeason || mo.idx !== offSeason.idx);
  const prime = primePool.slice().sort((a, b) => b.primeFit - a.primeFit)[0] || null;

  return { months, prime, offSeason, notes: cityItem.seasonNotes || {} };
}

// ── TRIP-PLANNER WEEKLY CURVE ───────────────────────────────────────────
// The swim-lane planner draws one visit-desirability curve per city across
// the year and lets you slide a trip box to the best week. That curve is
// `weeklyVisitScore`.
//
// METHOD (carried as `weeklyVisitScore.method` — project rule: every derived
// value states how it was derived):
//   month score  = comfort/5 * 0.70  +  (5 − crowd)/5 * 0.30,  scaled ×100
//   week score   = linear interpolation between adjacent MONTH CENTERS (the
//                  15th) evaluated at the week's midpoint, so the curve is
//                  smooth instead of stepping at month boundaries.
// where:
//   • comfort = monthComfort() (0–5) — the SAME comfort source cityVisitWindow
//     uses, so Prime/Off-season and this curve never disagree about a month.
//   • crowd   = crowdSeason[m] (0–5, 5 = peak); absent ⇒ neutral 2.5.
// "Fewer crowds = better" here is a deliberate, documented departure from
// Prime's shoulder-season bell: a trip wants the most comfortable, least
// crowded week, full stop — not the lively-but-not-overrun month Prime picks.
// Returns 0–100 ints (one per week) or null when the city has no full
// 12-month climate (never faked — a lane with null shows "not measured").
function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function monthVisitScores(cityItem) {
  const climate = cityItem.visitClimate;
  if (!Array.isArray(climate) || climate.length !== 12) return null;
  const crowd = cityItem.crowdSeason || [];
  const out = new Array(12);
  for (let m = 0; m < 12; m++) {
    const comfort = monthComfort(climate[m]);
    if (comfort == null) return null; // require a complete year; honest blank otherwise
    const c = Number.isFinite(crowd[m]) ? crowd[m] : 2.5;
    out[m] = (comfort / 5 * 0.7 + (5 - c) / 5 * 0.3) * 100;
  }
  return out;
}

// viewStart: Date of the first day shown (a Monday). weeks: how many week
// columns to score. Default window = the Monday on/before Jan 1 of the
// current year for 53 weeks (one calendar year). Scores are seasonal, so the
// exact year only matters for week→month alignment.
export function weeklyVisitScore(cityItem, viewStart, weeks = 53) {
  const ms = monthVisitScores(cityItem);
  if (!ms) return null;
  let start = viewStart instanceof Date ? viewStart : null;
  if (!start) {
    const y = new Date().getFullYear();
    start = new Date(y, 0, 1);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // back up to Monday
  }
  const out = new Array(weeks);
  for (let w = 0; w < weeks; w++) {
    const d = new Date(start);
    d.setDate(d.getDate() + w * 7 + 3); // midpoint (Thursday) of the week
    const m = d.getMonth();
    const dom = d.getDate();
    let score;
    if (dom >= 15) {
      const next = (m + 1) % 12;
      const t = Math.min(1, (dom - 15) / daysInMonth(d.getFullYear(), m));
      score = ms[m] + (ms[next] - ms[m]) * t;
    } else {
      const prev = (m + 11) % 12;
      const prevDim = daysInMonth(d.getFullYear(), prev);
      const t = Math.min(1, (15 - dom) / prevDim);
      score = ms[m] + (ms[prev] - ms[m]) * t;
    }
    out[w] = Math.max(0, Math.min(100, Math.round(score)));
  }
  return out;
}
weeklyVisitScore.method =
  "Per-week visit score: month score = comfort/5*0.70 + (5−crowd)/5*0.30 (×100), " +
  "linearly interpolated between month centers (15th) at each week's midpoint. " +
  "comfort = monthComfort (shared with Prime/Off-season); crowd = crowdSeason (5=peak, " +
  "absent⇒2.5). Fewer crowds = better (departs from Prime's shoulder bell by design).";
