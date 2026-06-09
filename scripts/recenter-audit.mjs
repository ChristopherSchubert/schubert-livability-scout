// scripts/recenter-audit.mjs — REVIEW-ONLY pin-placement audit.
// For each city, compares plateau-decay POI capture at the current pin
// against the best nearby center (grid search over the cached Google POIs).
// Flags cities whose pin sits off their own cluster. Writes nothing.
//
// Caveat: poi_positions is cached within MAX_RADIUS (1500 m) of the CURRENT
// pin, so the "better center" gain is a LOWER BOUND — a recentered refetch
// would pull in POIs beyond today's cache. Good enough to flag; not to finalize.
import pg from "pg";
import { execFileSync } from "node:child_process";
import { decayWeight, PLATEAU, MAX_RADIUS } from "../lib/measurers/walking-core.js";

const dbpw = execFileSync("security",["find-generic-password","-a","livability-scout","-s","supabase-db-password","-w"],{encoding:"utf8"}).trim();
const c = new pg.Client({host:"aws-1-us-west-2.pooler.supabase.com",port:5432,user:"postgres.fitjkrmiwkdolxhitroc",password:dbpw,database:"postgres",ssl:{rejectUnauthorized:false}});
await c.connect();
const r = await c.query("SELECT name, slug, lat, lon, stay_zone, poi_positions FROM cities ORDER BY name");
await c.end();

const hav=(a,b,cc,d)=>{const R=6371000,t=Math.PI/180,dla=(cc-a)*t,dlo=(d-b)*t;const x=Math.sin(dla/2)**2+Math.cos(a*t)*Math.cos(cc*t)*Math.sin(dlo/2)**2;return 2*R*Math.asin(Math.sqrt(x));};
const score=(clat,clon,pois)=>{let s=0,inP=0;for(const p of pois){const d=hav(clat,clon,p.lat,p.lon);if(d>MAX_RADIUS)continue;s+=decayWeight(d);if(d<=PLATEAU)inP++;}return {s,inP};};

const DRIFT_CAP = 1500; // meters — don't recommend moving farther than the cache radius
const out=[];
for (const row of r.rows){
  const pois = Array.isArray(row.poi_positions)?row.poi_positions:[];
  if (pois.length===0){ out.push({...row, n:0, nocache:true}); continue; }
  const cur = score(row.lat,row.lon,pois);
  let best={s:cur.s,inP:cur.inP,lat:row.lat,lon:row.lon,moved:0};
  for(let i=-13;i<=13;i++)for(let j=-13;j<=13;j++){
    const clat=row.lat+i*0.001, clon=row.lon+j*(0.001/Math.cos(row.lat*Math.PI/180));
    const moved=hav(row.lat,row.lon,clat,clon);
    if(moved>DRIFT_CAP)continue;
    const {s,inP}=score(clat,clon,pois);
    if(s>best.s) best={s,inP,lat:clat,lon:clon,moved:Math.round(moved)};
  }
  out.push({name:row.name,slug:row.slug,stay_zone:row.stay_zone,n:pois.length,
    curW:cur.s,curP:cur.inP,bestW:best.s,bestP:best.inP,moved:best.moved,
    gainW:best.s-cur.s, gainPct: cur.s>0?(best.s-cur.s)/cur.s:0, blat:best.lat,blon:best.lon});
}

const flagged = out.filter(o=>!o.nocache).sort((a,b)=>b.gainPct-a.gainPct);
const nocache = out.filter(o=>o.nocache);
console.log(`\n${out.length} cities · ${nocache.length} without POI cache\n`);
console.log("RANKED BY % CAPTURE GAIN FROM RECENTERING (lower bound; review-only)\n");
console.log("move(m)  +cap%   curW→bestW   plat(cur→best)  city");
for(const o of flagged){
  if(o.gainPct<0.10 || o.moved<150) continue; // only meaningful misses
  console.log(`${String(o.moved).padStart(6)}  ${(o.gainPct*100).toFixed(0).padStart(4)}%   ${o.curW.toFixed(1).padStart(4)}→${o.bestW.toFixed(1).padStart(4)}     ${String(o.curP).padStart(2)}→${String(o.bestP).padStart(2)}        ${o.name}  [${o.blat.toFixed(5)},${o.blon.toFixed(5)}]`);
}
if(nocache.length){console.log("\nNO POI CACHE (can't audit):"); for(const o of nocache) console.log("  "+o.name);}
