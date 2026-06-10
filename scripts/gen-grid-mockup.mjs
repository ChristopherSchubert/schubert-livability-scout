#!/usr/bin/env node
// Generate the Grid (/mockups/trip-grid.html) FROM the real trips row — the
// full-trip artifact, now with its three FUNCTIONS (not just looks):
//   1. Overview + jump surface — day headers link into the workspace; the
//      grid is the zoomed-out map, the Days view is where you act.
//   2. Details on demand — click any block → the full entry: note,
//      confirmation, contact, cost, link. The spreadsheet's embedded
//      logistics, recovered (they were the artifact's superpower).
//   3. Print artifact — paginates BY LEG for paper, with the cash +
//      reservations companion tables (Janice's workbook printed its Cash
//      sheet alongside the grid).
// Plus: sticky time gutter (horizontal scroll) + sticky day header (vertical
// scroll). Layout remains 100% computed from the entries — nothing hand-placed.

import { Client } from "pg";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { rowToTrip, tripDays, cashNeeded, bookingsLedger } from "../lib/trip.js";

const PX_PER_MIN = 1.05;
const DAY_START = 5 * 60, DAY_END = 23.5 * 60;
const COL_W = 108, GUT = 56, HEAD_H = 58;
const H = (DAY_END - DAY_START) * PX_PER_MIN;

const pw = execFileSync("security", ["find-generic-password", "-a", "livability-scout", "-s", "supabase-db-password", "-w"]).toString().trim();
const c = new Client({ host: "aws-1-us-west-2.pooler.supabase.com", port: 5432, user: "postgres.fitjkrmiwkdolxhitroc", database: "postgres", password: pw, ssl: { rejectUnauthorized: false } });
await c.connect();
const trip = rowToTrip((await c.query("select * from trips where name = $1 limit 1", ["Slovenia"])).rows[0]);
await c.end();

const days = tripDays(trip);
const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmtDow = (date) => DOW[new Date(date + "T12:00:00").getDay()];

// Compact entry payload for the detail popover (real logistics, on demand).
const payload = trip.entries.map((e, i) => ({
  i, day: e.day, start: e.time.start, end: e.time.end, kind: e.kind, role: e.role,
  title: e.title, note: e.note || null, conf: e.booking?.confirmation || null,
  prepaid: !!e.booking?.prepaid, contact: e.contact || null, url: e.url || null,
  cost: e.cost ? `${e.cost.amount} ${e.cost.currency}${e.cost.cashOnly ? " · cash only" : ""}` : null,
}));

// ── reusable grid renderer over a subset of days (main sheet + per-leg print sheets)
function renderGrid(subset, { links = true } = {}) {
  const idx = Object.fromEntries(subset.map((d, i) => [d.date, i]));
  const width = subset.length * COL_W;

  const bands = [];
  for (const leg of trip.legs) {
    const inSet = subset.filter((d) => d.date >= leg.arrive && d.date <= leg.depart);
    if (inSet.length) bands.push({ name: leg.name.split(",")[0], from: idx[inSet[0].date], n: inSet.length });
  }
  const bandHtml = bands.map((b) =>
    `<div class="band" style="left:${b.from * COL_W}px;width:${b.n * COL_W}px">${esc(b.name)}</div>`).join("");

  const heads = subset.map((d, i) => {
    const dt = new Date(d.date + "T12:00:00");
    const inner = `<span class="dow">${fmtDow(d.date)}</span><span class="dn">${dt.getDate()}</span>`;
    return links
      ? `<a class="gh" href="trip-workspace.html?day=${d.date}" title="Open ${d.date} in the workspace" style="left:${i * COL_W}px;width:${COL_W}px">${inner}</a>`
      : `<div class="gh" style="left:${i * COL_W}px;width:${COL_W}px">${inner}</div>`;
  }).join("");

  let rules = "";
  for (let m = DAY_START; m <= DAY_END; m += 60) {
    rules += `<div class="hr" style="top:${(m - DAY_START) * PX_PER_MIN}px"></div>`;
  }
  const vlines = subset.map((_, i) => `<div class="vline" style="left:${i * COL_W}px"></div>`).join("");

  let blocks = "";
  for (const p of payload) {
    const col = idx[p.day];
    if (col == null) continue;
    const s = Math.max(toMin(p.start), DAY_START), en = Math.min(toMin(p.end), DAY_END);
    if (en <= s) continue;
    const top = (s - DAY_START) * PX_PER_MIN, h = Math.max((en - s) * PX_PER_MIN - 2, 12);
    const meta = [p.prepaid ? "🔒" : "", p.cost?.includes("cash") ? "💶" : ""].join("");
    blocks += `<button class="blk k-${p.kind}${p.role === "connective" ? " conn" : ""}" data-i="${p.i}" ` +
      `style="left:${col * COL_W + 3}px;top:${top}px;width:${COL_W - 6}px;height:${h}px" ` +
      `aria-label="${esc(p.title)}, ${p.start} to ${p.end}">` +
      `${h >= 34 ? `<span class="bt">${p.start.replace(/^0/, "")}</span>` : ""}` +
      `<span class="bn">${esc(p.title)}</span>${meta ? `<span class="bm">${meta}</span>` : ""}</button>`;
  }

  // hour labels live in the sticky gutter column
  let glabels = "";
  for (let m = DAY_START; m <= DAY_END; m += 60) {
    const hh = Math.floor(m / 60);
    glabels += `<div class="hl" style="top:${HEAD_H + (m - DAY_START) * PX_PER_MIN}px">${((hh + 11) % 12) + 1}${hh < 12 ? "a" : "p"}</div>`;
  }

  return `<div class="gridcard"><div class="gutcol" style="height:${HEAD_H + H}px">${glabels}</div>` +
    `<div class="gfield" style="width:${width}px"><div class="ghead">${bandHtml}${heads}</div>` +
    `<div class="gbody" style="height:${H}px">${rules}${vlines}${blocks}</div></div></div>`;
}

// ── companion tables (the workbook's Cash sheet + the bookings binder)
const cash = cashNeeded(trip);
const cashRows = trip.entries.filter((e) => e.cost?.cashOnly)
  .map((e) => `<tr><td>${esc(e.title)}</td><td class="num">${e.cost.amount} ${e.cost.currency}</td></tr>`).join("");
const cashTotal = Object.entries(cash).map(([cur, amt]) => `${amt} ${cur}`).join(" + ");
const ledgerRows = bookingsLedger(trip)
  .map((e) => `<tr><td>${esc(e.title)}</td><td><code>${esc(e.booking.confirmation || "—")}</code></td><td>${e.booking.prepaid ? "prepaid" : ""}</td></tr>`).join("");

const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
const mainGrid = renderGrid(days);
const legSheets = trip.legs.map((leg) => {
  const subset = days.filter((d) => d.date >= leg.arrive && d.date <= leg.depart);
  return `<section class="printsheet"><h2 class="psname">${esc(leg.name.split(",")[0])} · ${leg.arrive.slice(5)}–${leg.depart.slice(5)}</h2>${renderGrid(subset, { links: false })}</section>`;
}).join("");

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
.tripbar{position:sticky;top:0;z-index:40;background:var(--panel);border-bottom:1px solid var(--border);padding:.7rem 1.6rem;display:flex;align-items:center;gap:1.2rem;box-shadow:0 4px 14px rgba(41,33,19,.05);}
.tripbar .back{font-size:.82rem;color:var(--accent);text-decoration:none;font-weight:600;}
.tripbar .tname{font-family:var(--font-display);font-size:1.18rem;}
.tripbar .tmeta{font-size:.78rem;color:var(--muted);}
.tripbar .spacer{flex:1}
.tripbar .stamp{font-size:.74rem;color:var(--muted);font-style:italic;}
.printbtn{font-size:.78rem;font-weight:600;border:1px solid var(--border);background:var(--bg);border-radius:100px;padding:.4rem .95rem;cursor:pointer;}
.sheet{max-width:1320px;margin:1.4rem auto 0;padding:0 1.6rem;}
.hint{font-size:.78rem;color:var(--muted);margin:0 0 .6rem;}
.gridcard{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 10px 30px rgba(41,33,19,.06);
overflow:auto;max-height:78vh;display:flex;align-items:flex-start;}
.gutcol{position:sticky;left:0;z-index:8;flex:0 0 ${GUT}px;background:var(--panel);border-right:1px solid var(--border);}
.hl{position:absolute;right:6px;font-size:.72rem;color:var(--muted);transform:translateY(-7px);font-variant-numeric:tabular-nums;}
.gutcol{position:sticky;position:-webkit-sticky;}
.gutwrap{position:relative;width:${GUT}px;}
.gfield{position:relative;flex:0 0 auto;}
.ghead{position:sticky;top:0;z-index:6;height:${HEAD_H}px;background:var(--panel-strong);border-bottom:1px solid var(--border);}
.band{position:absolute;top:4px;height:20px;font-family:var(--font-display);font-style:italic;font-size:.85rem;color:var(--muted);border-left:1px solid var(--border);padding-left:.55rem;}
.gh{position:absolute;top:26px;height:30px;border-left:1px solid var(--border);padding:.15rem 0 0 .55rem;font-size:.78rem;color:inherit;text-decoration:none;display:block;}
a.gh:hover{background:#e7f1ee;}
.gh .dow{color:var(--muted);margin-right:.3rem;}.gh .dn{font-weight:600;font-variant-numeric:tabular-nums;}
.gbody{position:relative;}
.hr{position:absolute;left:0;right:0;height:1px;background:var(--panel-strong);}
.vline{position:absolute;top:0;bottom:0;width:1px;background:var(--panel-strong);}
.blk{position:absolute;border-radius:5px;border:1px solid var(--border);border-left:3px solid var(--kc,var(--border));
background:var(--panel);padding:1px 5px;overflow:hidden;font-size:.72rem;line-height:1.25;box-shadow:0 1px 3px rgba(41,33,19,.07);
text-align:left;font-family:var(--font-ui);cursor:pointer;color:var(--text);}
.blk:hover{box-shadow:0 2px 8px rgba(13,76,68,.25);z-index:3;}
.blk:focus-visible{outline:2px solid var(--accent);outline-offset:1px;z-index:3;}
.blk .bt{font-variant-numeric:tabular-nums;color:var(--muted);font-size:.68rem;display:block;}
.blk .bn{font-weight:600;display:block;}
.blk .bm{position:absolute;right:4px;top:2px;font-size:.7rem;}
.blk.conn{background:repeating-linear-gradient(135deg,var(--panel),var(--panel) 6px,rgba(120,100,60,.05) 6px,rgba(120,100,60,.05) 8px);}
.blk.conn .bn{font-weight:400;color:var(--muted);}
.k-booked{--kc:var(--kind-booked)}.k-meal{--kc:var(--kind-meal)}.k-travel{--kc:var(--kind-travel)}
.k-checkin{--kc:var(--kind-checkin)}.k-todo{--kc:var(--kind-todo)}.k-flexible{--kc:var(--kind-flexible)}
.legend{display:flex;gap:1rem;flex-wrap:wrap;padding:.8rem .2rem;font-size:.76rem;color:var(--muted);}
.legend .sw{display:inline-block;width:11px;height:11px;border-radius:3px;vertical-align:-1px;margin-right:.3rem;border:1px solid var(--border);border-left:3px solid var(--kc);background:var(--panel);}

/* companion tables */
.companion{display:grid;grid-template-columns:1fr 1.3fr;gap:1.4rem;max-width:1320px;margin:1.6rem auto 3rem;padding:0 1.6rem;align-items:start;}
.ctable{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:1rem 1.2rem;}
.ctable h2{font-family:var(--font-display);font-weight:500;font-size:1.1rem;margin:0 0 .6rem;}
.ctable table{width:100%;border-collapse:collapse;font-size:.82rem;}
.ctable td{padding:.35rem .3rem;border-top:1px solid var(--panel-strong);}
.ctable .num{text-align:right;font-variant-numeric:tabular-nums;font-weight:600;}
.ctable tfoot td{font-weight:700;border-top:2px solid var(--border);}
.ctable code{font-size:.76rem;background:var(--panel-strong);border-radius:4px;padding:.05rem .35rem;}

/* detail popover — the logistics, on demand */
#pop{position:fixed;z-index:60;width:330px;background:var(--panel);border:1px solid var(--border);border-left:4px solid var(--kc,var(--accent));
border-radius:10px;box-shadow:0 18px 44px rgba(41,33,19,.22);padding:.9rem 1rem;display:none;}
#pop .ptime{font-size:.76rem;color:var(--muted);font-variant-numeric:tabular-nums;}
#pop h3{font-family:var(--font-display);font-weight:500;font-size:1.12rem;margin:.15rem 0 .1rem;}
#pop .pkind{font-size:.7rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--kc,var(--muted));}
#pop .pnote{font-size:.82rem;color:#2c2823;margin:.5rem 0;}
#pop .prow{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;margin-top:.45rem;font-size:.78rem;}
#pop code{background:var(--panel-strong);border-radius:4px;padding:.08rem .4rem;font-variant-numeric:tabular-nums;}
#pop .pday{display:inline-block;margin-top:.7rem;font-size:.78rem;font-weight:600;color:var(--accent);text-decoration:none;}
#pop .x{position:absolute;top:.45rem;right:.6rem;border:0;background:none;font-size:1rem;color:var(--muted);cursor:pointer;}
#scrim{position:fixed;inset:0;z-index:55;display:none;}

.printsheet{display:none;}
@media print{
  .tripbar,.sheet,.hint{display:none!important;}
  .printsheet{display:block;page-break-after:always;padding:1rem;}
  .printsheet .gridcard{max-height:none;overflow:visible;border:1px solid #999;box-shadow:none;}
  .psname{font-family:var(--font-display);font-size:1.2rem;margin:.2rem 0 .5rem;}
  .companion{page-break-inside:avoid;}
  body{background:#fff;}
}
</style></head><body>

<div class="tripbar"><a class="back" href="trip-workspace.html">← Days</a><span class="tname">Slovenia — the Grid</span>
<span class="tmeta">May 15–25, 2026 · ${days.length} days · ${trip.entries.length} entries</span><span class="spacer"></span>
<button class="printbtn" onclick="window.print()">Print (one leg per page)</button>
<span class="stamp">generated from the trips table · ${stamp}</span></div>

<div class="sheet">
<p class="hint">Click any block for its logistics — notes, codes, contacts. Click a day header to open that day in the workspace. Gutter and header stay put while you scroll.</p>
${mainGrid}
<div class="legend">
<span><span class="sw" style="--kc:var(--kind-booked)"></span>booked</span>
<span><span class="sw" style="--kc:var(--kind-meal)"></span>meal</span>
<span><span class="sw" style="--kc:var(--kind-travel)"></span>travel</span>
<span><span class="sw" style="--kc:var(--kind-checkin)"></span>check-in/out</span>
<span><span class="sw" style="--kc:var(--kind-todo)"></span>to-do</span>
<span><span class="sw" style="--kc:var(--kind-flexible)"></span>flexible</span>
<span><span class="sw" style="background:repeating-linear-gradient(135deg,#fffdf6,#fffdf6 5px,rgba(120,100,60,.07) 5px,rgba(120,100,60,.07) 7px);--kc:var(--border)"></span>connective</span>
<span>🔒 prepaid · 💶 cash</span>
</div>
</div>

<div class="companion">
<div class="ctable"><h2>Cash needed</h2><table><tbody>${cashRows}</tbody>
<tfoot><tr><td>Total</td><td class="num">${cashTotal}</td></tr></tfoot></table></div>
<div class="ctable"><h2>Bookings binder</h2><table><tbody>${ledgerRows}</tbody></table></div>
</div>

${legSheets}

<div id="scrim"></div>
<aside id="pop" role="dialog" aria-modal="false" aria-label="Entry details">
<button class="x" aria-label="Close">×</button>
<div class="ptime"></div><div class="pkind"></div><h3></h3><p class="pnote"></p><div class="prow"></div>
<a class="pday" href="#">Open this day in the workspace →</a>
</aside>

<script>
// Popover content is built with createElement/textContent only — entry text
// (titles, notes) is data, never parsed as HTML.
const ENTRIES = ${JSON.stringify(payload)};
const pop = document.getElementById("pop"), scrim = document.getElementById("scrim");
const KCOL = {booked:"var(--kind-booked)",meal:"var(--kind-meal)",travel:"var(--kind-travel)",checkin:"var(--kind-checkin)",todo:"var(--kind-todo)",flexible:"var(--kind-flexible)"};
function chip(text) { const s = document.createElement("span"); s.textContent = text; return s; }
function show(e, ev) {
  pop.style.setProperty("--kc", KCOL[e.kind] || "var(--accent)");
  pop.querySelector(".ptime").textContent = e.day + " · " + e.start + "–" + e.end;
  pop.querySelector(".pkind").textContent = e.kind + (e.role === "connective" ? " · connective" : "");
  pop.querySelector("h3").textContent = e.title;
  const note = pop.querySelector(".pnote");
  note.textContent = e.note || "";
  note.style.display = e.note ? "" : "none";
  const row = pop.querySelector(".prow");
  row.replaceChildren();
  if (e.prepaid) row.append(chip("🔒 prepaid"));
  if (e.conf) { const c2 = document.createElement("code"); c2.textContent = e.conf; row.append(c2); }
  if (e.cost) row.append(chip("💶 " + e.cost));
  if (e.contact) row.append(chip("📞 " + e.contact));
  if (e.url) { const a = document.createElement("a"); a.href = e.url; a.textContent = "link"; a.target = "_blank"; a.rel = "noopener"; row.append(a); }
  pop.querySelector(".pday").href = "trip-workspace.html?day=" + e.day;
  const x = Math.min(ev.clientX + 14, innerWidth - 348), y = Math.min(ev.clientY + 14, innerHeight - 240);
  pop.style.left = x + "px"; pop.style.top = Math.max(y, 60) + "px";
  pop.style.display = "block"; scrim.style.display = "block";
}
function hide() { pop.style.display = "none"; scrim.style.display = "none"; }
document.querySelectorAll(".blk").forEach((b) =>
  b.addEventListener("click", (ev) => show(ENTRIES[+b.dataset.i], ev)));
pop.querySelector(".x").addEventListener("click", hide);
scrim.addEventListener("click", hide);
addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
</script>
</body></html>`;

await writeFile("public/mockups/trip-grid.html", html);
console.log(`wrote public/mockups/trip-grid.html — ${trip.entries.length} entries, ${days.length} days, ${trip.legs.length} print sheets, popover payload ${payload.length}`);
