import pg from "pg";
import { execSync } from "node:child_process";
import { measureClimate, measureBuildingCoverage } from "../lib/measure.js";
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const pw = execSync("security find-generic-password -a livability-scout -s supabase-db-password -w",{encoding:"utf8"}).trim();
const c = new pg.Client({host:"aws-1-us-west-2.pooler.supabase.com",port:5432,user:"postgres.fitjkrmiwkdolxhitroc",password:pw,database:"postgres",ssl:{rejectUnauthorized:false}});
await c.connect();
const asOf = new Date().toISOString().slice(0,10);
const {rows} = await c.query("select id,name,lat,lon,measured_metrics from cities order by name");
let done=0;
for (const city of rows){
  if (city.lat==null){ console.log(`- ${city.name}`); continue; }
  const cl = await measureClimate(city.lat, city.lon, {asOf});
  await sleep(800);
  const bc = await measureBuildingCoverage(city.lat, city.lon);
  await sleep(1000);
  const merged = {...cl.metrics, ...bc};
  if (!Object.keys(merged).length){ console.log(`⚠ ${city.name}: nothing`); continue; }
  const mm = {...(city.measured_metrics||{}), ...merged};
  await c.query("update cities set measured_metrics=$1::jsonb where id=$2",[JSON.stringify(mm), city.id]);
  const f=cl.metrics.days_below_freeze?.value, cd=cl.metrics.clear_days?.value, dl=cl.metrics.dec_daylight_hr?.value, b=bc.bldg_coverage?.value;
  console.log(`✓ ${city.name}: freeze ${f??"?"}d/yr | clear ${cd??"?"}d | Dec daylight ${dl??"?"}h | bldg cover ${b??"?"}`);
  done++;
}
console.log(`\n${done}/${rows.length} got climate + bldg`);
await c.end();
