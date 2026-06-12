"use client";

// TripWindow (#22) — the calendar strip at the top of the Plan tab. A date
// ribbon across the trip with each leg drawn as a coloured segment. The
// boundary between two adjacent legs is a draggable handle: drag it (or focus +
// arrow keys) to move days from one leg to its neighbour. The trip's start/end
// stay fixed — only the two touching legs change, so there's no cascade. Days
// snap (1 cell = 1 day) and clamp so neither leg drops below one day. Persists
// the adjusted legs via TripProvider.updateTripFrame.
import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, useDraggable } from "@dnd-kit/core";
import { tripDays } from "../lib/trip";
import { useTrips } from "./TripProvider";

const LEG_COLORS = ["#0d4c44", "#2e5482", "#9a5a16", "#665285", "#6b6358"];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const DAY_MS = 86400000;

function dayNum(ymd) { return ymd ? ymd.slice(8, 10) : ""; }
function monthLabel(ymd) {
  if (!ymd) return "";
  return new Date(ymd + "T00:00:00").toLocaleDateString("en-US", { month: "short" });
}
function dow(ymd) { return ymd ? DOW[new Date(ymd + "T00:00:00").getDay()] : ""; }
function parse(ymd) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function fmt(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function addDays(ymd, n) { const d = parse(ymd); if (!d) return ymd; return fmt(new Date(d.getTime() + n * DAY_MS)); }
function between(a, b) { const x = parse(a), y = parse(b); return x && y ? Math.round((y - x) / DAY_MS) : 0; }

// One draggable boundary handle, positioned on the grid line before `colIdx`.
function BoundaryHandle({ id, colIdx, cellW, label, onNudge }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const x = colIdx * cellW + (transform ? transform.x : 0);
  return (
    <button
      ref={setNodeRef}
      className={`twn-bound${isDragging ? " dragging" : ""}`}
      style={{ left: x }}
      {...attributes}
      {...listeners}
      onKeyDown={(ev) => {
        if (ev.key === "ArrowLeft") { ev.preventDefault(); onNudge(id, -1); }
        else if (ev.key === "ArrowRight") { ev.preventDefault(); onNudge(id, 1); }
      }}
      aria-label={label}
      title="Drag (or arrow keys) to move days between legs"
    >
      <span className="twn-bound-grip" aria-hidden="true" />
    </button>
  );
}

export default function TripWindow({ trip }) {
  const { updateTripFrame } = useTrips();
  const rowRef = useRef(null);
  const [cellW, setCellW] = useState(0);
  const [preview, setPreview] = useState(null); // { boundary, shift } while dragging
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }));

  const days = useMemo(() => (trip ? tripDays(trip) : []), [trip]);
  const cols = days.length;

  // Measure one day-column's width so pointer deltas snap to whole days.
  useEffect(() => {
    const el = rowRef.current;
    if (!el || !cols) return;
    const measure = () => setCellW(el.clientWidth / cols);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [cols]);

  // Segments straight from the legs (so a live preview is a pure recompute).
  const baseLegs = trip?.legs || [];
  const segments = useMemo(() => {
    const start = trip?.startDate;
    if (!start) return [];
    return baseLegs.map((l, i) => ({
      legName: l.legName || l.name, arrive: l.arrive, depart: l.depart,
      startIdx: Math.max(0, between(start, l.arrive)),
      span: Math.max(1, between(l.arrive, l.depart) + 1),
      color: LEG_COLORS[i % LEG_COLORS.length],
    }));
  }, [baseLegs, trip?.startDate]);

  // Apply a day-shift to a boundary: clamp so neither touching leg < 1 day,
  // move days from one leg to the other, persist. Returns the clamped shift.
  function shiftBoundary(boundaryIdx, rawShift, commit) {
    const i = boundaryIdx;
    const left = baseLegs[i], right = baseLegs[i + 1];
    if (!left || !right) return 0;
    if (addDays(left.depart, 1) !== right.arrive) return 0; // only adjacent legs
    const leftSpan = between(left.arrive, left.depart) + 1;
    const rightSpan = between(right.arrive, right.depart) + 1;
    const s = Math.max(-(leftSpan - 1), Math.min(rightSpan - 1, rawShift));
    if (commit && s !== 0) {
      const legs = baseLegs.map((l, k) => {
        if (k === i) return { ...l, depart: addDays(l.depart, s) };
        if (k === i + 1) return { ...l, arrive: addDays(l.arrive, s) };
        return l;
      });
      updateTripFrame(trip.id, { legs });
    }
    return s;
  }

  if (!cols) return null;

  // Render segments, applying the in-flight preview shift to the dragged boundary.
  const view = segments.map((s) => ({ ...s }));
  if (preview) {
    const i = preview.boundary;
    if (view[i]) view[i].span += preview.shift;
    if (view[i + 1]) { view[i + 1].startIdx += preview.shift; view[i + 1].span -= preview.shift; }
  }

  // Adjacent-leg boundaries get a handle (at the right leg's start column).
  const boundaries = [];
  for (let i = 0; i < baseLegs.length - 1; i++) {
    if (addDays(baseLegs[i].depart, 1) === baseLegs[i + 1].arrive) {
      boundaries.push({ i, colIdx: segments[i + 1].startIdx + (preview?.boundary === i ? preview.shift : 0) });
    }
  }

  function onDragMove(ev) {
    if (!cellW) return;
    const i = ev.active.id;
    const s = shiftBoundary(i, Math.round(ev.delta.x / cellW), false);
    setPreview({ boundary: i, shift: s });
  }
  function onDragEnd(ev) {
    if (cellW) shiftBoundary(ev.active.id, Math.round(ev.delta.x / cellW), true);
    setPreview(null);
  }

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
      <DndContext sensors={sensors} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => setPreview(null)}>
        <div className="twn-legs" ref={rowRef} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {view.map((s, i) => (
            <span key={i} className="twn-leg"
                  style={{ gridColumn: `${s.startIdx + 1} / span ${Math.max(1, s.span)}`, "--leg": s.color }}>
              {s.legName ? s.legName.replace(/,.*$/, "") : "—"}<small> {Math.max(1, s.span)}n</small>
            </span>
          ))}
          {cellW ? boundaries.map((b) => (
            <BoundaryHandle key={b.i} id={b.i} colIdx={b.colIdx} cellW={cellW}
                            label={`Move days between ${segments[b.i]?.legName?.replace(/,.*$/, "")} and ${segments[b.i + 1]?.legName?.replace(/,.*$/, "")}`}
                            onNudge={(id, dir) => shiftBoundary(id, dir, true)} />
          )) : null}
        </div>
      </DndContext>
    </div>
  );
}
