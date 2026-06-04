import pg from "pg";
import { execFileSync } from "node:child_process";
import { findVisitCenters } from "../lib/measure.js";

const dbpw = execFileSync("security", ["find-generic-password", "-a", "livability-scout", "-s", "supabase-db-password", "-w"], { encoding: "utf8" }).trim();
const c = new pg.Client({ host:"aws-1-us-west-2.pooler.supabase.com", port:5432, user:"postgres.fitjkrmiwkdolxhitroc", password:dbpw, database:"postgres", ssl:{rejectUnauthorized:false} });
await c.connect();
const r = await c.query("SELECT name, lat, lon FROM cities WHERE name IN ('Allison Park, PA', 'Bristol, RI', 'Essex, CT')");
for (const row of r.rows) {
  console.log(`\n=== ${row.name}  pin=(${row.lat}, ${row.lon})`);
  const peaks = await findVisitCenters(row.lat, row.lon, { max: 4, maxDriftM: 5000 });
  for (const p of peaks) console.log(`  cluster: (${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}) n=${p.n} moved=${p.moved}m`);
}
await c.end();
