// Solve — the trip-planner auto-assembler (core IP). Turns a day's ANCHORS
// (the things you came for) into an ordered, travel-aware, clocked plan: the
// grid Janice builds by hand today. See features/trip-planner-systems.md §5.
//
// v1 is deliberately greedy and fully editable after: fixed-time bookings are
// HARD (pinned at their slots, partitioning the day into gaps); floating
// anchors are filled into the gaps by nearest-neighbour to minimise travel;
// travel legs are estimated from haversine (§4) until road routing lands; meals
// drop into meal windows; leftover time is surfaced as free, never hidden. If
// it doesn't fit, Solve FLAGS the day — it never silently drops an anchor.

// ── geo + time helpers (dependency-free) ────────────────────────────────────
function haversineKm(a, b) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
// §4 travel-time: walk under 1.2 km, else drive; ×1.3 road factor. Returns min.
export function travelMinutes(a, b) {
  if (!a || !b) return 0;
  const km = haversineKm(a, b) * 1.3;
  const speed = km < 1.2 ? 4.5 : 50; // km/h
  return Math.max(km < 0.05 ? 0 : 4, Math.round((km / speed) * 60));
}
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const toHHMM = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(Math.round(min) % 60).padStart(2, "0")}`;

// ── the solver ──────────────────────────────────────────────────────────────
// day = {
//   date, lodging: {lat,lon,name}, dayStart="07:00", dayEnd="23:00",
//   anchors: [{ id, title, durationMin, location:{lat,lon}, fixedTime?:"HH:MM", kind? }],
//   mealWindows: [{ name:"Lunch", from:"12:00", to:"14:00", durationMin:60 }]
// }
// returns { date, entries:[{start,end,kind,role,title,...}], feasible, flags:[] }
export function solveDay(day) {
  const dayStart = toMin(day.dayStart || "07:00");
  const dayEnd = toMin(day.dayEnd || "23:00");
  const flags = [];
  const out = [];

  const fixed = day.anchors.filter((a) => a.fixedTime).sort((x, y) => toMin(x.fixedTime) - toMin(y.fixedTime));
  // Meal-kind floating anchors are the meal — they fill meal windows, not the
  // greedy activity fill (a chosen restaurant IS lunch, placed near lunchtime).
  let floating = day.anchors.filter((a) => !a.fixedTime && a.kind !== "meal");
  const mealAnchors = day.anchors.filter((a) => !a.fixedTime && a.kind === "meal");

  // Detect hard fixed-time collisions up front (never guess around them).
  for (let i = 1; i < fixed.length; i++) {
    const prevEnd = toMin(fixed[i - 1].fixedTime) + fixed[i - 1].durationMin;
    if (toMin(fixed[i].fixedTime) < prevEnd) {
      flags.push(`Conflict: "${fixed[i - 1].title}" overruns "${fixed[i].title}" (fixed times overlap).`);
    }
  }

  // Boundaries that partition the day: lodging-start, each fixed anchor, lodging-end.
  const stops = [
    { time: dayStart, loc: day.lodging, anchor: null }, // morning at lodging
    ...fixed.map((a) => ({ time: toMin(a.fixedTime), loc: a.location, anchor: a })),
    { time: dayEnd, loc: day.lodging, anchor: null },    // end of day back at lodging
  ];

  const mealsLeft = [...(day.mealWindows || [])];

  // Walk each gap between consecutive stops; fill greedily.
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i], to = stops[i + 1];
    // Emit the fixed anchor that opens this gap (except the synthetic start).
    if (from.anchor) {
      out.push(entryFor(from.anchor, toMin(from.anchor.fixedTime), "anchor"));
    }
    let cursorTime = from.anchor ? toMin(from.anchor.fixedTime) + from.anchor.durationMin : from.time;
    let cursorLoc = from.loc;
    const gapEnd = to.time; // we must arrive at `to` by its time

    // Greedily insert nearest floating anchors that fit (travel + duration +
    // travel-on to `to`), nearest-neighbour from the cursor.
    let progress = true;
    while (progress && floating.length) {
      progress = false;
      floating.sort((a, b) => travelMinutes(cursorLoc, a.location) - travelMinutes(cursorLoc, b.location));
      const cand = floating[0];
      const travelIn = travelMinutes(cursorLoc, cand.location);
      const travelOut = travelMinutes(cand.location, to.loc);
      const buffer = cand.durationMin >= 120 ? 20 : 10; // rest after a heavy item
      if (cursorTime + travelIn + cand.durationMin + buffer + travelOut <= gapEnd) {
        if (travelIn) out.push(travelEntry(cursorTime, travelIn, cursorLoc, cand.location));
        cursorTime += travelIn;
        out.push(entryFor(cand, cursorTime, "anchor"));
        cursorTime += cand.durationMin;
        if (buffer) { out.push(bufferEntry(cursorTime, buffer)); cursorTime += buffer; }
        cursorLoc = cand.location;
        floating = floating.slice(1);
        progress = true;
      }
    }

    // Drop a meal into this gap ONLY if no meal already sits in/near the window
    // (a meal anchor like a chosen restaurant counts — don't double-feed).
    for (let m = mealsLeft.length - 1; m >= 0; m--) {
      const mw = mealsLeft[m];
      const wFrom = toMin(mw.from), wTo = toMin(mw.to);
      const alreadyFed = out.some((e) => e.kind === "meal" && toMin(e.start) >= wFrom - 90 && toMin(e.start) <= wTo);
      if (alreadyFed) { mealsLeft.splice(m, 1); continue; }
      const at = Math.max(cursorTime, wFrom);
      if (at >= wFrom && at + mw.durationMin <= Math.min(wTo, gapEnd)) {
        // Use a chosen restaurant if we have one; else a generic meal block.
        const named = mealAnchors.shift();
        out.push({ start: toHHMM(at), end: toHHMM(at + mw.durationMin), kind: "meal", role: named ? "anchor" : "connective", title: named ? named.title : mw.name, id: named?.id });
        cursorTime = at + mw.durationMin;
        mealsLeft.splice(m, 1);
      }
    }

    // Reserve travel to the next fixed stop, then surface leftover BEFORE it as
    // free (so free never overlaps the outbound travel).
    const tOut = to.anchor ? travelMinutes(cursorLoc, to.loc) : 0;
    const freeEnd = gapEnd - tOut;
    if (freeEnd - cursorTime >= 45 && i < stops.length - 2) {
      out.push({ start: toHHMM(cursorTime), end: toHHMM(freeEnd), kind: "flexible", role: "connective", title: "Free / open" });
      cursorTime = freeEnd;
    }
    if (tOut && cursorTime + tOut <= to.time) out.push(travelEntry(to.time - tOut, tOut, cursorLoc, to.loc));
  }

  const unplaced = [...floating, ...mealAnchors];
  if (unplaced.length) flags.push(`Over-packed: ${unplaced.length} anchor(s) couldn't fit — ${unplaced.map((a) => a.title).join(", ")}.`);

  out.sort((a, b) => toMin(a.start) - toMin(b.start));
  return { date: day.date, entries: out, feasible: flags.length === 0, flags };
}

function entryFor(a, startMin, role) {
  return { start: toHHMM(startMin), end: toHHMM(startMin + a.durationMin), kind: a.kind || "booked", role, title: a.title, id: a.id };
}
function travelEntry(startMin, mins, from, to) {
  return { start: toHHMM(startMin), end: toHHMM(startMin + mins), kind: "travel", role: "connective", title: `Travel (${mins} min, est.)`, estimate: true };
}
function bufferEntry(startMin, mins) {
  return { start: toHHMM(startMin), end: toHHMM(startMin + mins), kind: "flexible", role: "connective", title: "Buffer / rest" };
}
