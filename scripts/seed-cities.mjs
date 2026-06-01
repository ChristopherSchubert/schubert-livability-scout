// scripts/seed-cities.mjs — one-time seed of the 22 starter cities into the
// Supabase `cities` table. Connects through the session pooler (bypasses RLS
// as table owner). Idempotent: upserts by unique name.
//
//   node scripts/seed-cities.mjs
import pg from "pg";
import { defaultState } from "../lib/planner-data.js";
import { cityToRow } from "../lib/city-row.js";

const c = new pg.Client({
  host: "aws-1-us-west-2.pooler.supabase.com", port: 5432,
  user: "postgres.fitjkrmiwkdolxhitroc",
  password: process.env.SUPABASE_DB_PASSWORD || "vudjyT-vohko5-gyjzaz",
  database: "postgres", ssl: { rejectUnauthorized: false },
});

const cols = [
  "name","slug","stay_zone","heart_intersection","trip_week","why","if_wins","if_fails",
  "blocks","status","decision","hero_image","arrive_date","depart_date","trip_length",
  "flight_details","car_details","lodging_details","logistics_notes","days","checklists",
  "matrix","measured","measured_metrics","visit_climate","crowd_season","season_notes",
];
const jsonCols = new Set(["blocks","days","checklists","matrix","measured_metrics","visit_climate","crowd_season","season_notes"]);

await c.connect();
const cities = defaultState().cities;
let n = 0;
for (const city of cities) {
  const row = cityToRow(city);
  const vals = cols.map((k) => (jsonCols.has(k) && row[k] != null ? JSON.stringify(row[k]) : row[k]));
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(",");
  const updates = cols.filter((k) => k !== "name").map((k) => `${k}=excluded.${k}`).join(",");
  await c.query(
    `insert into cities (${cols.join(",")}) values (${placeholders})
     on conflict (name) do update set ${updates}`,
    vals,
  );
  n += 1;
}
const r = await c.query("select count(*) from cities");
console.log(`✓ seeded ${n} cities; table now has ${r.rows[0].count}`);
await c.end();
