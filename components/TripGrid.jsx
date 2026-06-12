"use client";

// TripGrid — the Grid tab (#29). The deck's signature view: a time gutter with
// the trip's days as columns, each entry positioned as a block by its time
// (top = start, height = duration), category-coloured. Timed entries place
// themselves; bucket/flex entries collect in a tray above the grid. Click a
// block to edit. Horizontal scroll for long trips.
import { useMemo } from "react";
import { tripDays, entriesByDay } from "../lib/trip";

const HOUR_START = 6, HOUR_END = 24, PX = 42; // px per hour
const CAT_COLOR = { meal: "#9a5a16", activity: "#0d4c44", travel: "#2e5482", stay: "#665285", errand: "#6b6358" };

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

export default function TripGrid({ trip, onEdit }) {
  const days = useMemo(() => (trip ? tripDays(trip) : []), [trip]);
  const byDay = useMemo(() => (trip ? entriesByDay(trip) : {}), [trip]);
  const bodyH = (HOUR_END - HOUR_START) * PX;
  const hours = [];
  for (let h = HOUR_START; h <= HOUR_END; h++) hours.push(h);

  if (!days.length) return <p className="tw-stub">No days yet.</p>;

  return (
    <div className="tg-scroll">
      <div className="tg-toolbar">
        <span className="tg-cap">{trip.name} · {trip.startDate} – {trip.endDate}</span>
        <button className="tg-print" onClick={() => window.print()} title="Print this grid">🖨 print</button>
      </div>
      <div className="tg">
        <div className="tg-gutter" style={{ height: bodyH + 28 }}>
          <div className="tg-corner" />
          {hours.map((h) => <div key={h} className="tg-hr" style={{ top: 28 + (h - HOUR_START) * PX }}>{fmtHr(h)}</div>)}
        </div>
        {days.map((d) => {
          const list = byDay[d.date] || [];
          const timed = list.map((e) => ({ e, s: span(e) }));
          const untimed = timed.filter((x) => !x.s).map((x) => x.e);
          return (
            <div key={d.date} className="tg-col">
              <div className="tg-head"><b>{d.date.slice(5)}</b><small>{d.legName ? d.legName.replace(/,.*$/, "") : ""}</small></div>
              {untimed.length ? (
                <div className="tg-tray">{untimed.map((e) => (
                  <button key={e.id} className="tg-chip" style={{ "--c": CAT_COLOR[e.category] || "#6b6358" }} onClick={() => onEdit(e)} title={e.title}>{e.title}</button>
                ))}</div>
              ) : null}
              <div className="tg-body" style={{ height: bodyH }}>
                {hours.map((h) => <div key={h} className="tg-line" style={{ top: (h - HOUR_START) * PX }} />)}
                {timed.filter((x) => x.s).map(({ e, s }) => {
                  const top = ((s.start / 60) - HOUR_START) * PX;
                  const height = Math.max(((s.end - s.start) / 60) * PX, 16);
                  if (top < -PX || top > bodyH) return null;
                  return (
                    <button key={e.id} className="tg-block" onClick={() => onEdit(e)}
                            style={{ top, height, "--c": CAT_COLOR[e.category] || "#6b6358" }} title={e.title}>
                      <b>{e.title}</b>
                      {height > 30 && e.place ? <small>{e.place.name}</small> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
