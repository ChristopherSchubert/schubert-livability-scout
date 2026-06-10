#!/usr/bin/env node
// Generate the Grid mockup (/mockups/trip-grid.html) FROM the real trips row —
// the print-ready full-trip artifact. Layout is COMPUTED from the 79 entries
// (top/height from times, column from day, leg bands from legs), not
// hand-placed — fixing the critique's #1/#2/#5/#12: the grid is engine-
// rendered, cross-leg honest (all 11 days, no fake-empty columns), carries the
// anchor/connective distinction, and adopts the light-fill + kind-spine
// language shared with the workspace.

import { Client } from "pg";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { rowToTrip, tripDays } from "../lib/trip.js";

const PX_PER_MIN = 1.05;
const DAY_START = 5 * 60;          // 05:00
const DAY_END = 23.5 * 60;         // 23:30
const COL_W = 108, GUTTER = 56;

const pw = execFileSync("security", ["find-generic-password", "-a", "livability-scout", "-s", "supabase-db-password", "-w"]).toString().trim();
const c = new Client({ host: "aws-1-us-west-2.pooler.supabase.com", port: 5432, user: "postgres.fitjkrmiwkdolxhitroc", database: "postgres", password: pw, ssl: { rejectUnauthorized: false } });
await c.connect();
const trip = rowToTrip((await c.query("select * from trips where name = $1 limit 1", ["Slovenia"])).rows[0]);
await c.end();

const days = tripDays(trip);
const dayIdx = Object.fromEntries(days.map((d, i) => [d.date, i]));
const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Leg bands across the header (contiguous day spans per leg).
const bands = [];
for (const leg of trip.legs) {
  const from = dayIdx[leg.arrive], to = dayIdx[leg.depart];
  bands.push({ name: leg.name.split(",")[0], from, to });
}

// Day headers.
const heads = days.map((d, i) => {
  const dt = new Date(d.date + "T12:00:00");
  return `<div class="gh" style="left:${GUTTER + i * COL_W}px;width:${COL_W}px"><span class="dow">${DOW[dt.getDay()]}</span><span class="dn">${dt.getDate()}</span></div>`;
}).join("\n");
const bandHtml = bands.map((b) =>
  `<div class="band" style="left:${GUTTER + b.from * COL_W}px;width:${(b.to - b.from + 1) * COL_W}px">${esc(b.name)}</div>`).join("\n");

// Hour rules + gutter labels.
let rules = "";
for (let m = DAY_START; m <= DAY_END; m += 60) {
  const y = (m - DAY_START) * PX_PER_MIN;
  const hh = Math.floor(m / 60), label = `${((hh + 11) % 12) + 1}${hh < 12 ? "a" : "p"}`;
  rules += `<div class="hr" style="top:${y}px"></div><div class="hl" style="top:${y}px">${label}</div>\n`;
}

// Entry blocks — computed, never hand-placed.
let blocks = "";
for (const e of trip.entries) {
  const col = dayIdx[e.day];
  if (col == null) continue;
  const s = Math.max(toMin(e.time.start), DAY_START), en = Math.min(toMin(e.time.end), DAY_END);
  if (en <= s) continue;
  const top = (s - DAY_START) * PX_PER_MIN, h = (en - s) * PX_PER_MIN;
  const left = GUTTER + col * COL_W;
  const conn = e.role === "connective" ? " conn" : "";
  const tall = h >= 34;
  const meta = [e.booking?.prepaid ? "🔒" : "", e.cost?.cashOnly ? "💶" : ""].join("");
  blocks += `<div class="blk k-${e.kind}${conn}" style="left:${left + 3}px;top:${top}px;width:${COL_W - 6}px;height:${Math.max(h - 2, 12)}px" title="${esc(e.title)} · ${e.time.start}–${e.time.end}">` +
    `${tall ? `<span class="bt">${e.time.start.replace(/^0/, "")}</span>` : ""}<span class="bn">${esc(e.title)}</span>${meta ? `<span class="bm">${meta}</span>` : ""}</div>\n`;
}

const W = GUTTER + days.length * COL_W;
const H = (DAY_END - DAY_START) * PX_PER_MIN;
const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Grid — Slovenia · generated</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,500&family=Inter+Tight:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#fbf6ea;--panel:#fffdf6;--panel-strong:#f4eddc;--border:#d8ccb8;--text:#1b1814;--muted:#6b6358;
--accent:#0d4c44;--radius:14px;--font-display:'Fraunces',Georgia,serif;--font-ui:'Inter Tight',system-ui,sans-serif;
--kind-booked:#0d4c44;--kind-meal:#9a5a16;--kind-travel:#2e5482;--kind-checkin:#665285;--kind-todo:#7d5e22;--kind-flexible:#6b6358;}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:var(--font-ui);background-image:radial-gradient(rgba(120,100,60,.035) 1px,transparent 1px);background-size:4px 4px;}
.tripbar{position:sticky;top:0;z-index:30;background:var(--panel);border-bottom:1px solid var(--border);padding:.7rem 1.6rem;display:flex;align-items:center;gap:1.2rem;box-shadow:0 4px 14px rgba(41,33,19,.05);}
.tripbar .back{font-size:.82rem;color:var(--accent);text-decoration:none;font-weight:600;}
.tripbar .tname{font-family:var(--font-display);font-size:1.18rem;}
.tripbar .tmeta{font-size:.78rem;color:var(--muted);}
.tripbar .spacer{flex:1}
.tripbar .stamp{font-size:.74rem;color:var(--muted);font-style:italic;}
.sheet{max-width:${W + 80}px;margin:1.6rem auto;padding:0 1.6rem;}
.gridcard{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 10px 30px rgba(41,33,19,.06);overflow-x:auto;}
.ghead{position:relative;height:58px;border-bottom:1px solid var(--border);background:var(--panel-strong);min-width:${W}px;}
.band{position:absolute;top:4px;height:20px;font-family:var(--font-display);font-style:italic;font-size:.85rem;color:var(--muted);
border-left:1px solid var(--border);padding-left:.55rem;}
.gh{position:absolute;top:26px;height:30px;border-left:1px solid var(--border);padding:.15rem 0 0 .55rem;font-size:.78rem;}
.gh .dow{color:var(--muted);margin-right:.3rem;}.gh .dn{font-weight:600;font-variant-numeric:tabular-nums;}
.gbody{position:relative;height:${H}px;min-width:${W}px;}
.hr{position:absolute;left:${GUTTER}px;right:0;height:1px;background:var(--panel-strong);}
.hl{position:absolute;left:0;width:${GUTTER - 8}px;text-align:right;font-size:.72rem;color:var(--muted);transform:translateY(-7px);font-variant-numeric:tabular-nums;}
.vline{position:absolute;top:0;bottom:0;width:1px;background:var(--panel-strong);}
.blk{position:absolute;border-radius:5px;border:1px solid var(--border);border-left:3px solid var(--kc,var(--border));
background:var(--panel);padding:1px 5px;overflow:hidden;font-size:.72rem;line-height:1.25;box-shadow:0 1px 3px rgba(41,33,19,.07);}
.blk .bt{font-variant-numeric:tabular-nums;color:var(--muted);font-size:.68rem;display:block;}
.blk .bn{font-weight:600;display:block;}
.blk .bm{position:absolute;right:4px;top:2px;font-size:.7rem;}
.blk.conn{background:repeating-linear-gradient(135deg,var(--panel),var(--panel) 6px,rgba(120,100,60,.05) 6px,rgba(120,100,60,.05) 8px);}
.blk.conn .bn{font-weight:400;color:var(--muted);}
.k-booked{--kc:var(--kind-booked)}.k-meal{--kc:var(--kind-meal)}.k-travel{--kc:var(--kind-travel)}
.k-checkin{--kc:var(--kind-checkin)}.k-todo{--kc:var(--kind-todo)}.k-flexible{--kc:var(--kind-flexible)}
.legend{display:flex;gap:1rem;flex-wrap:wrap;padding:1rem 1.6rem;font-size:.76rem;color:var(--muted);max-width:${W + 80}px;margin:0 auto;}
.legend .sw{display:inline-block;width:11px;height:11px;border-radius:3px;vertical-align:-1px;margin-right:.3rem;border:1px solid var(--border);border-left:3px solid var(--kc);background:var(--panel);}
.foot{font-family:var(--font-display);font-style:italic;color:var(--muted);font-size:.9rem;max-width:${W + 80}px;margin:0 auto 4rem;padding:0 1.6rem;}
@media print{.tripbar{position:static;box-shadow:none}.gridcard{border:0;box-shadow:none}}
</style></head><body>
<div class="tripbar"><a class="back" href="trip-workspace.html">← Days</a><span class="tname">Slovenia — the Grid</span>
<span class="tmeta">May 15–25, 2026 · all ${days.length} days · ${trip.entries.length} entries</span><span class="spacer"></span>
<span class="stamp">generated from the trips table · ${stamp}</span></div>
<div class="sheet"><div class="gridcard">
<div class="ghead">${bandHtml}\n${heads}</div>
<div class="gbody">
${rules}
${days.map((_, i) => `<div class="vline" style="left:${GUTTER + i * COL_W}px"></div>`).join("\n")}
${blocks}
</div></div></div>
<div class="legend">
<span><span class="sw" style="--kc:var(--kind-booked)"></span>booked</span>
<span><span class="sw" style="--kc:var(--kind-meal)"></span>meal</span>
<span><span class="sw" style="--kc:var(--kind-travel)"></span>travel</span>
<span><span class="sw" style="--kc:var(--kind-checkin)"></span>check-in/out</span>
<span><span class="sw" style="--kc:var(--kind-todo)"></span>to-do</span>
<span><span class="sw" style="--kc:var(--kind-flexible)"></span>flexible</span>
<span><span class="sw" style="background:repeating-linear-gradient(135deg,#fffdf6,#fffdf6 5px,rgba(120,100,60,.07) 5px,rgba(120,100,60,.07) 7px);--kc:var(--border)"></span>connective (travel · check-ins · logistics)</span>
<span>🔒 prepaid · 💶 cash</span>
</div>
<p class="foot">Every block's position and size is computed from the trip's entries — nothing hand-placed. All three legs share the sheet, so no day looks falsely empty. This is the artifact Janice used to type by hand; here it's printed by the machine.</p>
</body></html>`;

await writeFile("public/mockups/trip-grid.html", html);
console.log(`wrote public/mockups/trip-grid.html — ${trip.entries.length} entries, ${days.length} day columns, ${W}×${Math.round(H)}px`);
