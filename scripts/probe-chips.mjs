import pg from "pg";
import { execSync } from "node:child_process";
import { chipsFor, allChipsFor, chipFrequencies } from "../lib/chips.js";

const pw = execSync("security find-generic-password -a livability-scout -s supabase-db-password -w",{encoding:"utf8"}).trim();
const c = new pg.Client({host:"aws-1-us-west-2.pooler.supabase.com",port:5432,user:"postgres.fitjkrmiwkdolxhitroc",password:pw,database:"postgres",ssl:{rejectUnauthorized:false}});
await c.connect();
const {rows} = await c.query("select id,name,measured_metrics from cities order by name");
console.log(`# ${rows.length} cities\n`);

const cities = rows.map((r) => ({ name: r.name, measuredMetrics: r.measured_metrics || {}, mm: r.measured_metrics }));
const freq = chipFrequencies(cities);

console.log("## Award frequency (allChipsFor — what filtering sees):");
for (const [ch,n] of [...freq.entries()].sort((a,b)=>b[1]-a[1])) console.log(`${n.toString().padStart(3)}  ${ch}`);

console.log("\n## Display strip (rarity-ranked, top 4) per city:");
const details = cities.map((city) => {
  const jan = city.mm?.climate_extremes?.value?.jan_mean_f;
  const jul = city.mm?.climate_extremes?.value?.jul_mean_f;
  return { name: city.name, jan, jul, display: chipsFor(city, { frequencies: freq }), all: allChipsFor(city) };
});
for (const d of details.sort((a,b)=>(a.jan??99)-(b.jan??99))){
  const j = (d.jan==null?"   —":d.jan.toFixed(1)).padStart(5);
  const u = (d.jul==null?"   —":d.jul.toFixed(1)).padStart(5);
  console.log(`${j}F jan / ${u}F jul  ${d.name.padEnd(32)} ${d.display.join(" · ")}`);
}

console.log("\n## Spot-check: full chip set (what filters match)");
for (const name of ["Charleston, SC", "Burlington, VT", "Piran, Slovenia", "Carmel-by-the-Sea, CA", "Annapolis, MD"]) {
  const d = details.find((x) => x.name === name);
  if (d) console.log(`  ${name}: ${d.all.join(" · ")}`);
}

await c.end();
