import pg from "pg";
import { execSync } from "node:child_process";
import { measureWalkScore } from "../lib/measure.js";
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const pw = execSync("security find-generic-password -a livability-scout -s supabase-db-password -w",{encoding:"utf8"}).trim();
const KEY = execSync("security find-generic-password -a livability-scout -s walkscore-api-key -w",{encoding:"utf8"}).trim();
const c = new pg.Client({host:"aws-1-us-west-2.pooler.supabase.com",port:5432,user:"postgres.fitjkrmiwkdolxhitroc",password:pw,database:"postgres",ssl:{rejectUnauthorized:false}});
await c.connect();
const asOf = new Date().toISOString().slice(0,10);
const {rows} = await c.query("select id,name,lat,lon,measured_metrics from cities order by name");
let done=0;
for (const city of rows){
  if (city.lat==null){ console.log(`- ${city.name}: no coords`); continue; }
  const m = await measureWalkScore(city.lat, city.lon, city.name, KEY, {asOf});
  await sleep(1100); // ~1/sec
  if (!m.walk_score){ console.log(`⚠ ${city.name}: no walk score`); continue; }
  const mm = {...(city.measured_metrics||{}), ...m};
  await c.query("update cities set measured_metrics=$1::jsonb where id=$2",[JSON.stringify(mm), city.id]);
  console.log(`✓ ${city.name}: Walk Score ${m.walk_score.value}`);
  done++;
}
console.log(`\n${done}/${rows.length} got Walk Score`);
await c.end();
