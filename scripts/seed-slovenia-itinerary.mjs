#!/usr/bin/env node
// Seed the real May 2026 Slovenia trip itinerary into the Ljubljana / Bled /
// Piran city rows, transcribed verbatim from the owner's planning spreadsheet
// (Slovenia.xlsx). This is REAL data — every entry, code, and cost is copied
// from that artifact, nothing invented. It gives the trip-itinerary grid a
// true, dense trip to render against (features/trip-itinerary.md, step 1).
//
// Leg split (per-city itinerary; day columns derive from arrive/depart):
//   Ljubljana  May 15–16   (arrival + city day)
//   Bled       May 17–20   (Bled x3 + the Soča Valley / Hiša Franko day)
//   Piran      May 21–25   (Piran x3 + Venice day + the Kranj homeward leg)
//
// DDL already applied (migration 0012). Writes via the IPv4 session pooler
// (scripts/db-connection.md); password from the macOS Keychain.

import { Client } from "pg";
import { execFileSync } from "node:child_process";

const DAY_START = "05:00";
const DAY_END = "23:30";

// ── Curated entries. Each: { day, start, kind, title, ...optional }.
// kind ∈ booked | flexible | travel | meal | checkin | todo. `end` is computed
// below (tiles to the next entry's start on the same day).
const LJUBLJANA = [
  { day: "2026-05-15", start: "14:00", kind: "travel", title: "Land in Frankfurt" },
  { day: "2026-05-15", start: "14:30", kind: "travel", title: "Clear customs" },
  { day: "2026-05-15", start: "15:30", kind: "flexible", title: "Römerberg + old town", note: "Wander the Kleinmarkthalle." },
  { day: "2026-05-15", start: "16:30", kind: "meal", title: "Dessert at Zeit für Brot" },
  { day: "2026-05-15", start: "17:30", kind: "travel", title: "Leave for the airport" },
  { day: "2026-05-15", start: "20:00", kind: "travel", title: "Boarding in Frankfurt" },
  { day: "2026-05-15", start: "21:30", kind: "travel", title: "Land in Ljubljana" },
  { day: "2026-05-15", start: "22:30", kind: "travel", title: "Pick up rental car" },
  { day: "2026-05-15", start: "23:30", kind: "checkin", title: "Check in — Grand Hotel Union Eurostars", confirmation: "SYN2281-99143 / 4URL9VYYUB" },

  { day: "2026-05-16", start: "08:00", kind: "todo", title: "Buy Ljubljana City Card", note: "Covers boat tours, the funicular, and museums." },
  { day: "2026-05-16", start: "08:30", kind: "meal", title: "Breakfast at EK Bistro" },
  { day: "2026-05-16", start: "09:30", kind: "booked", title: "Funicular to Ljubljana Castle", note: "70-second ride up. Tour the castle, walk the battlements, visit the Chapel of St. George — allow 1–1.5 hrs. Covered by the City Card." },
  { day: "2026-05-16", start: "10:30", kind: "flexible", title: "Prešeren Square" },
  { day: "2026-05-16", start: "11:00", kind: "flexible", title: "Old Town wander", note: "Free with the Ljubljana City Card." },
  { day: "2026-05-16", start: "11:30", kind: "flexible", title: "Triple Bridge + Saturday market", note: "Start at the Triple Bridge (Tromostovje), walk Stritarjeva St, browse the riverside Saturday market — one of the best in Europe." },
  { day: "2026-05-16", start: "12:00", kind: "flexible", title: "Trubarjeva cesta" },
  { day: "2026-05-16", start: "15:00", kind: "booked", title: "Ljubljana boat cruise (45 min)", note: "Covered by the City Card." },
];

const BLED = [
  { day: "2026-05-17", start: "08:30", kind: "meal", title: "Breakfast at Grand Hotel Union Eurostars" },
  { day: "2026-05-17", start: "09:00", kind: "todo", title: "Get the Julian Alps Card" },
  { day: "2026-05-17", start: "09:30", kind: "travel", title: "Check out + drive to Vintgar Gorge" },
  { day: "2026-05-17", start: "11:00", kind: "booked", title: "Vintgar Gorge canyon walk", prepaid: true, note: "Check-in window 11:00–11:20, arrive by 10:30. A 1.6 km walk along the Radovna River on wooden walkways, 4 km from the lake. Dress sporty and a little warmer — it's always colder in the gorge." },
  { day: "2026-05-17", start: "14:00", kind: "checkin", title: "Check in — Grand Hotel Toplice", confirmation: "PH27710297" },
  { day: "2026-05-17", start: "15:00", kind: "booked", title: "Pletna boat to Bled Island", cost: { amount: 36, currency: "EUR", cashOnly: true }, note: "Hand-rowed wooden boat, €18/person return. Ring the church bell on the island (it's tradition). Queue ~17:00 for the 17:20 departure." },
  { day: "2026-05-17", start: "19:00", kind: "meal", title: "Dinner — Restavracija Julijana", note: "4-course vegetarian menu." },
  { day: "2026-05-17", start: "22:00", kind: "todo", title: "Decide Tuesday spa treatments", url: "https://www.sava-hotels-resorts.com/media/eqnozybe/spa-luisa-prices.pdf", note: "Also fill in the Venice trip passenger info." },

  { day: "2026-05-18", start: "10:00", kind: "flexible", title: "Bled Castle hike & tour", note: "Hike the forested lakeshore path (30–40 min) rather than driving — it earns the view. Castle opens 8 AM; tour the museum and walk the battlements." },
  { day: "2026-05-18", start: "12:00", kind: "meal", title: "Quick bite at Pizzeria Rustika" },
  { day: "2026-05-18", start: "13:30", kind: "booked", title: "Canyoning", prepaid: true, confirmation: "#138923", contact: "info@altitude-activities.com / +386 70 138 811", note: "Meet at Ljubljanska cesta 1, Bled (yellow doors). Bring a swimsuit, towel, and dry change — no changing rooms at the start." },
  { day: "2026-05-18", start: "15:30", kind: "flexible", title: "Thermal pool & spa", url: "https://www.sava-hotels-resorts.com/media/eqnozybe/spa-luisa-prices.pdf" },
  { day: "2026-05-18", start: "18:30", kind: "meal", title: "Dinner — Old Cellar Bled", note: "Lake view." },
  { day: "2026-05-18", start: "20:00", kind: "meal", title: "Bled cream cake — Slaščičarna Šmon" },

  { day: "2026-05-19", start: "05:00", kind: "flexible", title: "Wake up" },
  { day: "2026-05-19", start: "05:30", kind: "booked", title: "Hot-air balloon (private)", prepaid: true, confirmation: "401780164673", contact: "info@bcb.si / +386 41 664 545", note: "Pickup ~05:35 in front of Hotel Toplice. Sports clothing + sturdy, ideally waterproof shoes — morning dew on the field. Breakfast and balloon." },
  { day: "2026-05-19", start: "12:30", kind: "meal", title: "Lunch — Public & Vegan Kitchen Bled" },
  { day: "2026-05-19", start: "13:30", kind: "todo", title: "Pick up road-trip snacks for tomorrow" },
  { day: "2026-05-19", start: "16:00", kind: "booked", title: "Via Ferrata Hvadnik", prepaid: true, confirmation: "#138953", note: "Meeting point: Ljubljanska cesta 1, 4260 Bled (look for the yellow doors)." },
  { day: "2026-05-19", start: "21:00", kind: "meal", title: "Room service / eat on the balcony" },

  { day: "2026-05-20", start: "09:30", kind: "meal", title: "Breakfast at Grand Hotel Toplice" },
  { day: "2026-05-20", start: "10:30", kind: "travel", title: "Depart Bled via the Vršič Pass", note: "Intense but stunning drive: Bled → Kranjska Gora → Vršič Pass (1,611 m) → Trenta → Bovec. Stop at the Russian Chapel (built by POWs in 1916) and the Trenta Valley viewpoint." },
  { day: "2026-05-20", start: "11:30", kind: "meal", title: "Lunch near the Russian Church" },
  { day: "2026-05-20", start: "14:00", kind: "booked", title: "Paragliding in Kobarid — Flying Bear", cost: { amount: 380, currency: "EUR", cashOnly: true }, note: "Meet in the parking behind Teja bar, Kobarid. €190/person (€380 for two), cash only, paid after the flight. Be fit enough to run ~20 m." },
  { day: "2026-05-20", start: "16:30", kind: "checkin", title: "Check in — Hiša Franko", contact: "hisafranko@anaros.eu / +386 5 389 41 20" },
  { day: "2026-05-20", start: "19:00", kind: "meal", title: "Hiša Franko dinner", note: "Dress code: casual elegant — no sportswear, flip-flops, or shorts for men." },
];

const PIRAN = [
  { day: "2026-05-21", start: "09:00", kind: "meal", title: "Breakfast at Hiša Franko" },
  { day: "2026-05-21", start: "10:00", kind: "checkin", title: "Check out — Hiša Franko", note: "Check-out 11 AM." },
  { day: "2026-05-21", start: "11:00", kind: "travel", title: "Drive to Piran through Italy", note: "Along the Gulf of Trieste." },
  { day: "2026-05-21", start: "12:30", kind: "flexible", title: "Stop at Miramare Castle, Trieste" },
  { day: "2026-05-21", start: "15:00", kind: "checkin", title: "Check in — Hotel Piran", confirmation: "PH27710036" },
  { day: "2026-05-21", start: "16:00", kind: "booked", title: "Vintage boat private cruise", cost: { amount: 511, currency: "EUR", cashOnly: true }, note: "Cheese & prosecco, tour of the coast. Pay after, in cash." },
  { day: "2026-05-21", start: "19:00", kind: "meal", title: "Dinner — promenade to Portorož", note: "Concierge has vegetarian recommendations in and around Piran." },

  { day: "2026-05-22", start: "08:00", kind: "flexible", title: "Explore inland Istria" },
  { day: "2026-05-22", start: "08:30", kind: "flexible", title: "Vespa or bike tour" },
  { day: "2026-05-22", start: "10:00", kind: "flexible", title: "Explore Piran", note: "Tartini Square, Venetian Gothic facades, St. George's Cathedral (climb the bell tower for views over the Adriatic). Watch sunset from the Piran wall." },
  { day: "2026-05-22", start: "16:00", kind: "todo", title: "Get snacks for the Venice boat" },
  { day: "2026-05-22", start: "20:00", kind: "meal", title: "Sunset drinks — Heaven Terrace 99" },
  { day: "2026-05-22", start: "22:00", kind: "todo", title: "Decide final day: caves or not?", url: "https://tickets.postojnska-jama.eu/en/buy-step-1.html", note: "Book tickets; download the app if going." },

  { day: "2026-05-23", start: "07:00", kind: "travel", title: "Arrive at the catamaran 30 min early", note: "Check-in from 7:00; seats are first-come." },
  { day: "2026-05-23", start: "08:00", kind: "booked", title: "Catamaran to Venice (departure)", prepaid: true, note: "Meet at the pier by the Red Lighthouse, Kidričevo nabrežje, 6330 Piran." },
  { day: "2026-05-23", start: "11:00", kind: "flexible", title: "Arrive Venice — San Basilio", note: "Present passports + Venice day-visitor passes. Optional free guided tour to St. Mark's." },
  { day: "2026-05-23", start: "12:00", kind: "flexible", title: "Guided tour of Piazza San Marco (~1h)", note: "St. Mark's Basilica, the Campanile, the Doge's Palace." },
  { day: "2026-05-23", start: "13:00", kind: "meal", title: "Lunch — Hostaria Osottoosopra", note: "Veg highlights: artichoke heart w/ goat cheese & ginger-carrot cream (€20), gazpacho (€14), buffalo caprese (€16)." },
  { day: "2026-05-23", start: "14:00", kind: "meal", title: "Pasticceria Tonolo", note: "Authentic Venetian pastry, around the corner." },
  { day: "2026-05-23", start: "14:30", kind: "flexible", title: "Ponte dell'Accademia", note: "Best Grand Canal panorama — quick photo stop." },
  { day: "2026-05-23", start: "15:00", kind: "booked", title: "Gondola ride (30 min)", note: "Christian's Relaxing Gondola Rides, ~€80–90 for the boat. Quiet canals + the Grand Canal." },
  { day: "2026-05-23", start: "15:30", kind: "flexible", title: "Ponte di Rialto", note: "Murano glass shops, Grand Canal views." },
  { day: "2026-05-23", start: "16:00", kind: "travel", title: "Walk back to San Basilio (25 min via the Zattere)" },
  { day: "2026-05-23", start: "16:30", kind: "travel", title: "Boarding begins" },
  { day: "2026-05-23", start: "17:00", kind: "travel", title: "Boat departs for Piran" },

  { day: "2026-05-24", start: "10:00", kind: "checkin", title: "Check out — Hotel Piran", note: "Check-out 12 PM." },
  { day: "2026-05-24", start: "10:30", kind: "travel", title: "Drive to Postojna" },
  { day: "2026-05-24", start: "11:30", kind: "booked", title: "Postojna Cave", cost: { amount: 49, currency: "EUR", cashOnly: false }, note: "Combo ticket: Cave + Predjama Castle (~€49). Cave tour 1.5 hrs, includes the underground train ride." },
  { day: "2026-05-24", start: "13:00", kind: "flexible", title: "Predjama Castle", note: "~15 min from the cave." },
  { day: "2026-05-24", start: "14:30", kind: "travel", title: "Drive to Elegans Hotel Brdo" },
  { day: "2026-05-24", start: "15:30", kind: "checkin", title: "Check in — Elegans Hotel Brdo", confirmation: "B-50452" },
  { day: "2026-05-24", start: "17:00", kind: "flexible", title: "Explore Kranj & dinner" },
  { day: "2026-05-24", start: "20:00", kind: "flexible", title: "Sunset walk around the Brdo Estate" },

  { day: "2026-05-25", start: "06:30", kind: "travel", title: "Arrive at the airport & return the car" },
  { day: "2026-05-25", start: "09:00", kind: "travel", title: "Boarding" },
  { day: "2026-05-25", start: "09:30", kind: "travel", title: "Takeoff" },
];

const LEGS = [
  { name: "Ljubljana, Slovenia", arrive: "2026-05-15", depart: "2026-05-16", entries: LJUBLJANA },
  { name: "Bled, Slovenia", arrive: "2026-05-17", depart: "2026-05-20", entries: BLED },
  { name: "Piran, Slovenia", arrive: "2026-05-21", depart: "2026-05-25", entries: PIRAN },
];

const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

// Compute each entry's end = next entry's start on the same day (so blocks tile),
// last of the day = start + 90 min, clamped to DAY_END. Stamp a stable id.
function buildItinerary(entries) {
  const endMax = toMin(DAY_END);
  const byDay = {};
  for (const e of entries) (byDay[e.day] ||= []).push(e);
  const out = [];
  for (const day of Object.keys(byDay).sort()) {
    const list = byDay[day].slice().sort((a, b) => toMin(a.start) - toMin(b.start));
    list.forEach((e, i) => {
      const startMin = toMin(e.start);
      const next = list[i + 1];
      const endMin = Math.min(next ? toMin(next.start) : startMin + 90, endMax);
      out.push({ id: `e_${e.day}_${e.start.replace(":", "")}`, ...e, end: toHHMM(Math.max(endMin, startMin + 15)) });
    });
  }
  return { dayStart: DAY_START, dayEnd: DAY_END, entries: out };
}

const pw = execFileSync("security", ["find-generic-password", "-a", "livability-scout", "-s", "supabase-db-password", "-w"]).toString().trim();
const c = new Client({ host: "aws-1-us-west-2.pooler.supabase.com", port: 5432, user: "postgres.fitjkrmiwkdolxhitroc", database: "postgres", password: pw, ssl: { rejectUnauthorized: false } });
await c.connect();

for (const leg of LEGS) {
  const itinerary = buildItinerary(leg.entries);
  // itinerary + trip dates only — leave status untouched (these are the
  // Slovenia reference cities; don't reclassify them in the funnel).
  const res = await c.query(
    `update cities set itinerary = $1::jsonb, arrive_date = $2, depart_date = $3 where name = $4 returning name, arrive_date, depart_date`,
    [JSON.stringify(itinerary), leg.arrive, leg.depart, leg.name]
  );
  if (!res.rows.length) { console.log(`  ✗ ${leg.name} NOT FOUND`); continue; }
  console.log(`  ✓ ${res.rows[0].name}: ${itinerary.entries.length} entries, ${leg.arrive}→${leg.depart}`);
}

await c.end();
console.log("done.");
