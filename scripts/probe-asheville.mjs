// One-off probe: why does Asheville return 0 clusters inside its boundary?
import pg from "pg";
import { execFileSync } from "node:child_process";
import { findVisitCenters, pointInGeoJSON } from "../lib/measure.js";

const dbpw = execFileSync("security", ["find-generic-password", "-a", "livability-scout", "-s", "supabase-db-password", "-w"], { encoding: "utf8" }).trim();
const c = new pg.Client({ host:"aws-1-us-west-2.pooler.supabase.com", port:5432, user:"postgres.fitjkrmiwkdolxhitroc", password:dbpw, database:"postgres", ssl:{rejectUnauthorized:false} });
await c.connect();
const r = await c.query("SELECT name, lat, lon, stay_zone_boundary FROM cities WHERE name='Asheville, NC'");
const row = r.rows[0];
console.log("pin:", row.lat, row.lon);

// Try with boundary
console.log("\n=== findVisitCenters WITH boundary ===");
const withB = await findVisitCenters(row.lat, row.lon, { boundary: row.stay_zone_boundary });
console.log(withB);

// Try without boundary
console.log("\n=== findVisitCenters WITHOUT boundary ===");
const noB = await findVisitCenters(row.lat, row.lon, {});
console.log(noB);

// Check if those "without boundary" centers fall inside the saved boundary
console.log("\n=== Are unbounded peaks inside the saved boundary? ===");
for (const p of noB) {
  console.log(`  (${p.lat}, ${p.lon}) n=${p.n} moved=${p.moved}m → in boundary: ${pointInGeoJSON(p.lat, p.lon, row.stay_zone_boundary)}`);
}
await c.end();
