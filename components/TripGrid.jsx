"use client";

// TripGrid — the Grid tab (#29). The deck's signature view: a time gutter with
// the trip's days as columns, each entry positioned as a block by its time
// (top = start, height = duration), category-coloured. Timed entries place
// themselves; bucket/flex entries collect in a tray above the grid. Click a
// block to edit.
//
// Per-leg paging (#12): days are grouped by leg; one leg shows at a time via
// a tab row. Each leg section carries `tg-leg` so @media print breaks pages.
// Legend and status glyphs (🔒 💶 📌) also added (#12).
import { useMemo, useState } from "react";
import { tripDays, entriesByDay, tripDietChips } from "../lib/trip";
import { CAT_COLOR, MealScreen } from "./atoms";

const HOUR_START = 6, HOUR_END = 24, PX = 42; // px per hour — keep Janice #7 every-hour gutter

function toMin(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
function span(e) {
  const t = e.time || {};
  const start = t.mode === "range" ? toMin(t.start) : t.mode === "point" ? toMin(t.at) : null;
  if (start == null) return null;
  const end = t.mode === "range" && t.end ? toMin(t.end) : null;
  return { start, end: end && end > start ? end : start + 45 };
}
const fmtHr = (h) => (h === 0 || h === 24 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);
const fmtClock = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// ── Leg grouping helper ──────────────────────────────────────────────────────
// Returns [ { key, name, days: [day, …] }, … ] preserving the order legs appear.
// Days with no leg get their own group keyed "_unassigned".
export function groupDaysByLeg(days) {
  const groups = [];
  const keyOf = (d) => (d.legName && d.cityId) ? d.cityId : "_unassigned";
  const nameOf = (d) => d.legName ? d.legName.replace(/,.*$/, "") : "Other";
  for (const d of days) {
    const k = keyOf(d);
    const last = groups[groups.length - 1];
    if (last && last.key === k) {
      last.days.push(d);
    } else {
      groups.push({ key: k, name: nameOf(d), days: [d] });
    }
  }
  return groups;
}

// ── Status glyphs ────────────────────────────────────────────────────────────
// 🔒 only when booking.confirmation (or booking.status === "booked") is present.
// 💶 only when a real cash-only cost exists.
// 📌 only when entry.pinned is true (or a "pinned" marker is present).
// Never invent: the rules are strict, never show a glyph without real data.
function statusGlyphs(e) {
  const glyphs = [];
  const bk = e.booking || {};
  if (bk.confirmation || bk.status === "booked") glyphs.push("🔒");
  const c = e.cost || {};
  if (c.cashOnly && c.amount != null) glyphs.push("💶");
  if (e.pinned) glyphs.push("📌");
  return glyphs;
}

// ── Drive connector block ────────────────────────────────────────────────────
// Rendered for category === "travel" entries as thin dashed connector blocks.
// Duration label shown only when entry.duration (a real string on the entry)
// is present — never fabricated.
function DriveBlock({ e, s, bodyH, onEdit, dietChips }) {
  const top = ((s.start / 60) - HOUR_START) * PX;
  const height = Math.max(((s.end - s.start) / 60) * PX, 10);
  if (top < -PX || top > bodyH) return null;
  const label = e.duration ? `→ ${e.title} · ${e.duration}` : `→ ${e.title}`;
  return (
    <button
      key={e.id}
      className="tg-block tg-drive"
      onClick={() => onEdit(e)}
      style={{ top, height, "--c": CAT_COLOR.travel }}
      title={label}
      aria-label={`Drive: ${e.title}${e.duration ? `, ${e.duration}` : ""}`}
    >
      <b>{label}</b>
    </button>
  );
}

// ── Legend ───────────────────────────────────────────────────────────────────
const LEGEND_CATS = [
  { key: "activity", label: "activity" },
  { key: "meal",     label: "meal" },
  { key: "travel",   label: "drive · auto-timed", dash: true },
  { key: "stay",     label: "stay" },
];

function GridLegend() {
  return (
    <div className="tg-legend" aria-label="Grid legend">
      {LEGEND_CATS.map(({ key, label, dash }) => (
        <span key={key}>
          <i className={dash ? "tg-li tg-li-dash" : "tg-li"} style={{ "--lc": CAT_COLOR[key] || "#6b6358" }} aria-hidden="true" />
          {label}
        </span>
      ))}
      <span className="tg-legend-glyphs">🔒 booked · 💶 cash · 📌 pinned</span>
    </div>
  );
}

// ── Leg tabs ─────────────────────────────────────────────────────────────────
function LegTabs({ legs, activeLegIdx, onSelect }) {
  return (
    <div className="tg-pages" role="tablist" aria-label="Leg pages">
      {legs.map((lg, i) => (
        <button
          key={lg.key}
          role="tab"
          aria-selected={i === activeLegIdx}
          className={`tg-page${i === activeLegIdx ? " on" : ""}`}
          onClick={() => onSelect(i)}
        >
          {lg.name}
          <small>{lg.days.length} day{lg.days.length !== 1 ? "s" : ""}</small>
        </button>
      ))}
      <span className="tg-page-spacer" aria-hidden="true" />
      <span className="tg-pagenote" aria-live="polite">
        page {activeLegIdx + 1} of {legs.length} · each prints to one sheet
      </span>
    </div>
  );
}

// ── Day column ───────────────────────────────────────────────────────────────
function DayCol({ d, byDay, dietChips, bodyH, hours, onEdit }) {
  const list = byDay[d.date] || [];
  const timed = list.map((e) => ({ e, s: span(e) }));
  const untimed = timed.filter((x) => !x.s).map((x) => x.e);

  return (
    <div className="tg-col" role="gridcell">
      <div className="tg-head">
        <b>{d.date.slice(5)}</b>
        <small>{d.legName ? d.legName.replace(/,.*$/, "") : ""}</small>
      </div>
      {untimed.length ? (
        <div className="tg-tray">
          {untimed.map((e) => {
            const glyphs = statusGlyphs(e);
            return (
              <button key={e.id} className="tg-chip" style={{ "--c": CAT_COLOR[e.category] || "#6b6358" }} onClick={() => onEdit(e)} title={e.title}>
                {e.title}
                {glyphs.length ? <span className="tg-chip-glyphs">{glyphs.join("")}</span> : null}
                <MealScreen entry={e} dietChips={dietChips} />
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="tg-body" style={{ height: bodyH }} role="grid" aria-label={`Entries for ${d.date}`}>
        {hours.map((h) => <div key={h} className="tg-line" style={{ top: (h - HOUR_START) * PX }} aria-hidden="true" />)}
        {timed.filter((x) => x.s).map(({ e, s }) => {
          // Drive entries get the dashed connector treatment
          if (e.category === "travel") {
            return <DriveBlock key={e.id} e={e} s={s} bodyH={bodyH} onEdit={onEdit} dietChips={dietChips} />;
          }
          const top = ((s.start / 60) - HOUR_START) * PX;
          const height = Math.max(((s.end - s.start) / 60) * PX, 16);
          if (top < -PX || top > bodyH) return null;
          const glyphs = statusGlyphs(e);
          return (
            <button key={e.id} className="tg-block" onClick={() => onEdit(e)}
                    style={{ top, height, "--c": CAT_COLOR[e.category] || "#6b6358" }} title={e.title}
                    aria-label={`${e.title}, ${fmtClock(s.start)}–${fmtClock(s.end)}${e.place ? `, ${e.place.name}` : ""}${glyphs.length ? ` ${glyphs.join("")}` : ""}`}>
              <b>{e.title}{glyphs.length ? <span className="tg-glyphs">{glyphs.join("")}</span> : null}</b>
              {height > 30 && e.place ? <small>{e.place.name}</small> : null}
              <MealScreen entry={e} dietChips={dietChips} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function TripGrid({ trip, onEdit }) {
  const days = useMemo(() => (trip ? tripDays(trip) : []), [trip]);
  const byDay = useMemo(() => (trip ? entriesByDay(trip) : {}), [trip]);
  const dietChips = useMemo(() => (trip ? tripDietChips(trip) : []), [trip]);
  const legs = useMemo(() => groupDaysByLeg(days), [days]);
  const [activeLegIdx, setActiveLegIdx] = useState(0);

  const bodyH = (HOUR_END - HOUR_START) * PX;
  const hours = [];
  for (let h = HOUR_START; h <= HOUR_END; h++) hours.push(h);

  if (!days.length) return <p className="tw-stub">No days yet.</p>;

  const activeLeg = legs[Math.min(activeLegIdx, legs.length - 1)] || legs[0];

  return (
    <div className="tg-wrap" role="region" aria-label="Trip schedule grid">
      {/* Toolbar */}
      <div className="tg-toolbar">
        <span className="tg-cap">{trip.name} · {trip.startDate} – {trip.endDate}</span>
        <button className="tg-print" onClick={() => window.print()} title="Print — one leg per page">🖨 print · one leg per page</button>
      </div>

      {/* Leg tabs (per-leg paging) */}
      {legs.length > 1 && (
        <LegTabs legs={legs} activeLegIdx={activeLegIdx} onSelect={setActiveLegIdx} />
      )}

      {/* Legend — print-visible */}
      <GridLegend />

      {/*
        Each leg is its own .tg-leg section. Print CSS breaks pages here.
        Only the active leg is shown on screen; all legs print.
      */}
      {legs.map((lg, i) => (
        <section
          key={lg.key}
          className={`tg-leg${i === activeLegIdx ? " active" : ""}`}
          aria-label={`${lg.name} leg`}
          aria-hidden={i !== activeLegIdx ? "true" : undefined}
        >
          <div className="tg-scroll" role="group" aria-label={`${lg.name} schedule — days as columns, entries placed by time`}>
            <div className="tg">
              {/* Hour gutter — Janice #7: every hour 6a–9p */}
              <div className="tg-gutter" style={{ height: bodyH + 28 }}>
                <div className="tg-corner" />
                {hours.map((h) => <div key={h} className="tg-hr" style={{ top: 28 + (h - HOUR_START) * PX }}>{fmtHr(h)}</div>)}
              </div>
              {/* Day columns for this leg */}
              {lg.days.map((d) => (
                <DayCol
                  key={d.date}
                  d={d}
                  byDay={byDay}
                  dietChips={dietChips}
                  bodyH={bodyH}
                  hours={hours}
                  onEdit={onEdit}
                />
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
