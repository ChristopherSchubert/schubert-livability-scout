import pg from "pg";
import { execSync } from "node:child_process";
import { chipsFor, chipDebug } from "../lib/chips.js";

const pw = execSync("security find-generic-password -a livability-scout -s supabase-db-password -w",{encoding:"utf8"}).trim();
const c = new pg.Client({host:"aws-1-us-west-2.pooler.supabase.com",port:5432,user:"postgres.fitjkrmiwkdolxhitroc",password:pw,database:"postgres",ssl:{rejectUnauthorized:false}});
await c.connect();
const {rows} = await c.query("select id,name,measured_metrics from cities order by name");
console.log(`# ${rows.length} cities\n`);

const counts = {};
const details = [];
for (const r of rows){
  const city = { measuredMetrics: r.measured_metrics || {} };
  const chips = chipsFor(city);
  const jan = r.measured_metrics?.climate_extremes?.value?.jan_mean_f;
  const jul = r.measured_metrics?.climate_extremes?.value?.jul_mean_f;
  const dew = r.measured_metrics?.climate_extremes?.value?.jul_dewpoint_f;
  details.push({ name: r.name, jan, jul, dew, chips, mm: r.measured_metrics });
  for (const ch of chips) counts[ch] = (counts[ch]||0)+1;
}

console.log("## Chip frequency:");
for (const [ch,n] of Object.entries(counts).sort((a,b)=>b[1]-a[1])) console.log(`${n.toString().padStart(3)}  ${ch}`);

console.log("\n## January temp per city (sorted coldest→warmest), with chips:");
for (const d of details.sort((a,b)=>(a.jan??99)-(b.jan??99))){
  const j = (d.jan==null?"   —":d.jan.toFixed(1)).padStart(5);
  const u = (d.jul==null?"   —":d.jul.toFixed(1)).padStart(5);
  const w = (d.dew==null?"  —":d.dew.toFixed(1)).padStart(5);
  console.log(`${j}F jan / ${u}F jul / ${w}F dew  ${d.name.padEnd(32)} ${d.chips.join(" · ")}`);
}

console.log("\n## Cities with no climate_extremes:");
for (const d of details){
  if (d.jan == null) console.log(`  ${d.name}`);
}

await c.end();
