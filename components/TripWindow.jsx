"use client";

// TripWindow — the calendar strip at the top of the Plan tab (#22). A date
// ribbon across the trip with each leg drawn as a coloured segment (the
// "window" from the deck). Read-only for now; drag-to-adjust is a follow-up.
import { useMemo } from "react";
import { tripDays } from "../lib/trip";

const LEG_COLORS = ["#0d4c44", "#2e5482", "#9a5a16", "#665285", "#6b6358"];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function dayNum(ymd) { return ymd ? ymd.slice(8, 10) : ""; }
function monthLabel(ymd) {
  if (!ymd) return "";
  return new Date(ymd + "T00:00:00").toLocaleDateString("en-US", { month: "short" });
}
function dow(ymd) { return ymd ? DOW[new Date(ymd + "T00:00:00").getDay()] : ""; }

export default function TripWindow({ trip }) {
  const days = useMemo(() => (trip ? tripDays(trip) : []), [trip]);
  // Leg segments mapped onto the day array (contiguous runs by legName).
  const segments = useMemo(() => {
    const out = [];
    days.forEach((d, i) => {
      const last = out[out.length - 1];
      if (last && last.legName === d.legName) last.span += 1;
      else out.push({ legName: d.legName, startIdx: i, span: 1, color: LEG_COLORS[out.length % LEG_COLORS.length] });
    });
    return out;
  }, [days]);

  if (!days.length) return null;
  const cols = days.length;

  return (
    <div className="twn">
      <div className="twn-ribbon" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {days.map((d, i) => {
          const newMonth = i === 0 || monthLabel(d.date) !== monthLabel(days[i - 1].date);
          const weekend = [0, 6].includes(new Date(d.date + "T00:00:00").getDay());
          return (
            <div key={d.date} className={`twn-cell${weekend ? " we" : ""}`}>
              <span className="twn-mo">{newMonth ? monthLabel(d.date) : ""}</span>
              <span className="twn-dow">{dow(d.date)}</span>
              <span className="twn-day">{dayNum(d.date)}</span>
            </div>
          );
        })}
      </div>
      <div className="twn-legs" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {segments.map((s, i) => (
          <span key={i} className="twn-leg"
                style={{ gridColumn: `${s.startIdx + 1} / span ${s.span}`, "--leg": s.color }}>
            {s.legName ? s.legName.replace(/,.*$/, "") : "—"}<small> {s.span}n</small>
          </span>
        ))}
      </div>
    </div>
  );
}
