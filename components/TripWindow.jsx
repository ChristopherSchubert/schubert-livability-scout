"use client";

// TripWindow (#22, reworked) — the trip "spine": ONE horizontal bar that reads
// the journey at a glance. Each leg is a colour segment sized by its nights;
// per-night notches give a sense of days. Two kinds of edit:
//   • Inner grips (between date-adjacent legs) DRAG to move a night between
//     neighbours — the trip's start/end never move (shiftLegBoundary).
//   • End pills (a date + two chevrons) CLICK to add/remove a day at each end —
//     the deliberate, non-drag control for the trip's outer dates
//     (resizeTripStart / resizeTripEnd). Dragging off the edge is the wrong
//     gesture, so the ends are clicks, not drags.
// The readable per-city detail (hotel, click-to-plan) lives in the city cards
// rendered by TripPlan right below — the bar stays text-free so it never crams.
import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, useDraggable } from "@dnd-kit/core";
import { tripDays } from "../lib/trip";
import {
  addDays, daysBetween as between, legBoundaries, shiftLegBoundary,
  resizeTripStart, resizeTripEnd,
} from "../lib/trip-window";
import { useTrips } from "./TripProvider";

export const LEG_COLORS = ["#0d4c44", "#2e5482", "#9a5a16", "#665285", "#6b6358"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayNum(ymd) { return ymd ? String(+ymd.slice(8, 10)) : ""; }
function dow(ymd) { return ymd ? DOW[new Date(ymd + "T00:00:00").getDay()] : ""; }

// One draggable boundary grip, positioned on the day-column line before colIdx.
function BoundaryHandle({ id, colIdx, cellW, label, onNudge }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const x = colIdx * cellW + (transform ? transform.x : 0);
  return (
    <button
      ref={setNodeRef}
      className={`twn-grip${isDragging ? " dragging" : ""}`}
      style={{ left: x }}
      {...attributes}
      {...listeners}
      onKeyDown={(ev) => {
        if (ev.key === "ArrowLeft") { ev.preventDefault(); onNudge(id, -1); }
        else if (ev.key === "ArrowRight") { ev.preventDefault(); onNudge(id, 1); }
      }}
      aria-label={label}
      title="Drag (or arrow keys) to move a night between cities"
    >
      <span className="twn-grip-dots" aria-hidden="true" />
    </button>
  );
}

// One end pill: the boundary date flanked by chevrons. Left chevron moves this
// end a day EARLIER, right chevron a day LATER — spatially consistent on both
// ends. The side that *shortens* the trip is disabled at the one-day floor.
function EndPill({ date, onLeft, onRight, leftLabel, rightLabel, leftDisabled, rightDisabled }) {
  return (
    <div className="twn-end">
      <button className="twn-end-chev" onClick={onLeft} aria-label={leftLabel} title={leftLabel}
              disabled={leftDisabled}>
        <span aria-hidden="true">‹</span>
      </button>
      <span className="twn-end-date">
        <small>{dow(date)}</small>
        <b>{dayNum(date)}</b>
      </span>
      <button className="twn-end-chev" onClick={onRight} aria-label={rightLabel} title={rightLabel}
              disabled={rightDisabled}>
        <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}

export default function TripWindow({ trip, focus = null, onFocus }) {
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

  const baseLegs = trip?.legs || [];
  const segments = useMemo(() => {
    const start = trip?.startDate;
    if (!start) return [];
    return baseLegs.map((l, i) => ({
      legName: (l.legName || l.name || "").replace(/,.*$/, ""),
      legKey: l.cityId || l.name,
      startIdx: Math.max(0, between(start, l.arrive)),
      span: Math.max(1, between(l.arrive, l.depart) + 1),
      color: LEG_COLORS[i % LEG_COLORS.length],
    }));
  }, [baseLegs, trip?.startDate]);

  function shiftBoundary(boundaryIdx, rawShift, commit) {
    const { legs, shift } = shiftLegBoundary(baseLegs, boundaryIdx, rawShift);
    if (commit && shift !== 0) updateTripFrame(trip.id, { legs });
    return shift;
  }

  // Add/remove a day at an end. `kind` = "start" | "end", delta in days.
  function resizeEnd(kind, delta) {
    const res = kind === "start"
      ? resizeTripStart(trip.startDate, baseLegs, delta)
      : resizeTripEnd(trip.endDate, baseLegs, delta);
    if (res) updateTripFrame(trip.id, res);
  }

  if (!cols || !segments.length) return null;

  // Apply the in-flight preview shift to the dragged boundary.
  const view = segments.map((s) => ({ ...s }));
  if (preview) {
    const i = preview.boundary;
    if (view[i]) view[i].span += preview.shift;
    if (view[i + 1]) { view[i + 1].startIdx += preview.shift; view[i + 1].span -= preview.shift; }
  }

  const boundaries = legBoundaries(baseLegs).map((i) => ({
    i, colIdx: segments[i + 1].startIdx + (preview?.boundary === i ? preview.shift : 0),
  }));

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

  const first = baseLegs[0];
  const last = baseLegs[baseLegs.length - 1];
  const startFloor = first && first.arrive === first.depart;  // can't shorten from start
  const endFloor = last && last.arrive === last.depart;       // can't shorten from end

  return (
    <div className="twn">
      <div className="twn-barrow">
        <EndPill
          date={trip.startDate}
          onLeft={() => resizeEnd("start", -1)}
          onRight={() => resizeEnd("start", 1)}
          leftLabel="Start the trip a day earlier"
          rightLabel="Start the trip a day later (one night shorter)"
          rightDisabled={startFloor}
        />

        <DndContext sensors={sensors} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => setPreview(null)}>
          <div className="twn-legs" ref={rowRef} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {view.map((s, i) => {
              const style = {
                gridColumn: `${s.startIdx + 1} / span ${Math.max(1, s.span)}`,
                "--leg": s.color,
              };
              const on = focus === s.legKey;
              return (
                <button key={i} type="button"
                        className={`twn-seg${on ? " on" : ""}`}
                        style={style} aria-pressed={on}
                        aria-label={`Plan ${s.legName} (${Math.max(1, s.span)} nights)`}
                        onClick={() => onFocus && onFocus(on ? null : s.legKey)} />
              );
            })}
            <div className="twn-notches" aria-hidden="true"
                 style={{ backgroundImage: `repeating-linear-gradient(90deg, rgba(255,255,255,.32) 0 1px, transparent 1px calc(100% / ${cols}))` }} />
            {cellW ? boundaries.map((b) => (
              <BoundaryHandle key={b.i} id={b.i} colIdx={b.colIdx} cellW={cellW}
                              label={`Move a night between ${segments[b.i]?.legName} and ${segments[b.i + 1]?.legName}`}
                              onNudge={(id, dir) => shiftBoundary(id, dir, true)} />
            )) : null}
          </div>
        </DndContext>

        <EndPill
          date={trip.endDate}
          onLeft={() => resizeEnd("end", -1)}
          onRight={() => resizeEnd("end", 1)}
          leftLabel="End the trip a day earlier (one night shorter)"
          rightLabel="End the trip a day later"
          leftDisabled={endFloor}
        />
      </div>
    </div>
  );
}
