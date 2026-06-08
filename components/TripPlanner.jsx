"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  cityImageQuery,
  cityStage,
  weeklyVisitScore,
} from "../lib/planner-data";
import AppShell from "./AppShell";
import { resolveImage, usePlanner } from "./PlannerProvider";

// ── geometry constants (mirror the locked mockup) ───────────────────────
const WEEKS = 53;
const N = WEEKS * 7; // 371 days
const DEFAULT_DAY_W = 16;
const MIN_DAY_W = 6;
const MAX_DAY_W = 44;
const DEFAULT_TH = 65;
const DEFAULT_TRIP_LEN = 7; // nights for a fresh box

const MONTHS_LONG = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const MONTHS_SHORT = [
  "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec",
];
const CROWD_WORD = { 0: "empty", 1: "empty", 2: "quiet", 3: "steady", 4: "busy", 5: "packed" };

// ── date helpers ────────────────────────────────────────────────────────
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function startOfWeek(d) {
  const out = startOfDay(d);
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7)); // Monday = 0
  return out;
}
function addDays(d, n) { const out = startOfDay(d); out.setDate(out.getDate() + n); return out; }
function daysBetween(a, b) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}
function toYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fromYmd(s) {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

// ── score → color ramp (red → yellow → green over 40–80) ────────────────
function hexToRgb(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function lerpHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
function scoreColor(s) {
  let t = (s - 40) / 40;
  if (t < 0) t = 0; if (t > 1) t = 1;
  return t < 0.5 ? lerpHex("#b5402c", "#d6b13f", t * 2) : lerpHex("#d6b13f", "#4f8a3f", (t - 0.5) * 2);
}

function packFor(hi, rain) {
  const s = [];
  if (hi >= 80) s.push("light clothes + sun protection");
  else if (hi >= 66) s.push("light layers");
  else if (hi >= 52) s.push("layers + a warm jacket");
  else s.push("warm layers + a coat");
  if (rain >= 3) s.push("a rain shell");
  return s.join(", ");
}

export default function TripPlanner() {
  const { planner, updateCity, imageState, hydrated } = usePlanner();
  const rootRef = useRef(null);
  const updateCityRef = useRef(updateCity);
  updateCityRef.current = updateCity;

  // Window: Monday on/before the 1st of the current month, 53 weeks forward.
  // Robust year-round (always ~12 months of future) and seasonal scores make
  // the exact year matter only for week→month alignment.
  const today = useMemo(() => startOfDay(new Date()), []);
  const viewStart = useMemo(() => {
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    return startOfWeek(firstOfMonth);
  }, [today]);
  const todayDay = useMemo(() => daysBetween(viewStart, today), [viewStart, today]);

  // Per-week conditions for a city's lane (hover data + the curve), or null.
  const laneWeeks = useMemo(() => (cityItem) => {
    const scores = weeklyVisitScore(cityItem, viewStart, WEEKS);
    if (!scores) return null;
    const climate = cityItem.visitClimate;
    const crowd = cityItem.crowdSeason || [];
    const out = new Array(WEEKS);
    for (let w = 0; w < WEEKS; w++) {
      const d = addDays(viewStart, w * 7 + 3); // midpoint
      const m = d.getMonth();
      const cm = climate[m] || {};
      const wkStart = addDays(viewStart, w * 7);
      out[w] = {
        t: cm.hi != null ? Math.round(cm.hi) : null,
        lo: cm.lo != null ? Math.round(cm.lo) : null,
        x: Number.isFinite(crowd[m]) ? crowd[m] : 3,
        precip: cm.precipDays != null ? Math.round(cm.precipDays) : 0,
        day: cm.daylightHr != null ? Number(cm.daylightHr).toFixed(1) : "—",
        score: scores[w],
        label: `${MONTHS_SHORT[wkStart.getMonth()]} ${wkStart.getDate()}`,
      };
    }
    return out;
  }, [viewStart]);

  // ── bucket cities into the three sections ─────────────────────────────
  const { committed, planning, backlog } = useMemo(() => {
    const committed = [], planning = [], backlog = [];
    for (const c of planner.cities) {
      const stage = cityStage(c);
      if (stage === "decided" || stage === "decide") continue;
      const hasDates = c.arriveDate && c.departDate;
      if (c.status === "Scheduled" && hasDates) { committed.push(c); continue; }
      if (stage === "visit" || stage === "calibrate") planning.push(c);
      else backlog.push(c); // stage === "shortlist"
    }
    return { committed, planning, backlog };
  }, [planner.cities]);

  // Resolve each planning city to a lane: its trip box {start,len} (shifted
  // forward if stale, defaulted to the best future week if absent) + weeks.
  const planLanes = useMemo(() => {
    const lanes = planning.map((c) => {
      const weeks = laneWeeks(c);
      const arrive = fromYmd(c.arriveDate);
      const depart = fromYmd(c.departDate);
      let start, len;
      if (arrive && depart) {
        start = daysBetween(viewStart, arrive);
        len = Math.max(1, daysBetween(arrive, depart) + 1); // inclusive → nights
      } else {
        len = DEFAULT_TRIP_LEN;
        let best = -1, bestScore = -Infinity;
        if (weeks) {
          for (let w = 0; w < WEEKS; w++) {
            if (w * 7 < todayDay) continue;
            if (weeks[w].score > bestScore) { bestScore = weeks[w].score; best = w; }
          }
        }
        start = best >= 0 ? best * 7 : todayDay;
      }
      if (start < todayDay) start = todayDay;
      if (start + len > N) start = N - len;
      if (start < 0) start = 0;
      const wkNow = Math.min(WEEKS - 1, Math.max(0, Math.floor(todayDay / 7)));
      const scoreNow = weeks ? (weeks[wkNow]?.score ?? -1) : -1;
      return { city: c, weeks, start, len, scoreNow };
    });
    return lanes; // base order; display order is applied by sortMode below
  }, [planning, laneWeeks, viewStart, todayDay]);

  const committedLanes = useMemo(() => {
    const arr = committed.map((c) => {
      const arrive = fromYmd(c.arriveDate);
      const depart = fromYmd(c.departDate);
      const start = arrive ? daysBetween(viewStart, arrive) : todayDay;
      const len = arrive && depart ? Math.max(1, daysBetween(arrive, depart) + 1) : DEFAULT_TRIP_LEN;
      return { city: c, weeks: laneWeeks(c), start, len, row: 0 };
    }).sort((a, b) => a.start - b.start);
    // greedy row assignment so overlapping trips stack instead of colliding
    const rowEnds = [];
    for (const l of arr) {
      let row = rowEnds.findIndex((end) => end <= l.start);
      if (row < 0) { row = rowEnds.length; rowEnds.push(l.start + l.len); }
      else rowEnds[row] = l.start + l.len;
      l.row = row;
    }
    return arr;
  }, [committed, laneWeeks, viewStart, todayDay]);
  const committedRows = useMemo(
    () => committedLanes.reduce((m, l) => Math.max(m, l.row + 1), 1),
    [committedLanes],
  );

  // Pan-left bound: today, OR earlier if a committed trip is already under way
  // (so an in-progress trip renders whole instead of clipping at the edge).
  // Planning into the past stays blocked separately (the box clamps to today).
  const leftBound = useMemo(() => {
    let lb = todayDay;
    for (const l of committedLanes) if (l.start < lb) lb = l.start;
    return Math.max(0, lb);
  }, [committedLanes, todayDay]);

  // ── lane sort + manual order ──────────────────────────────────────────
  // sortMode: "next" (by scheduled trip), "best" (peak score first), "none"
  // (manual — set by dragging a lane's grip; persists in `order`).
  const [sortMode, setSortMode] = useState("next");
  const [confirmId, setConfirmId] = useState(null); // lane pending remove-confirm
  useEffect(() => {
    if (!confirmId) return;
    const onDown = (e) => { if (!e.target.closest(".ldemote-confirm") && !e.target.closest(".ldemote")) setConfirmId(null); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [confirmId]);
  const [order, setOrder] = useState([]);
  // One-time seed from the persisted planning_order column. If any lane has a
  // saved position, restore that manual arrangement and default to the manual
  // ("none") sort so the user sees it on load.
  const orderInitedRef = useRef(false);
  useEffect(() => {
    if (orderInitedRef.current || !planLanes.length) return;
    orderInitedRef.current = true;
    if (planLanes.some((l) => l.city.planningOrder != null)) {
      setOrder([...planLanes]
        .sort((a, b) => (a.city.planningOrder ?? 1e9) - (b.city.planningOrder ?? 1e9))
        .map((l) => l.city.id));
      setSortMode("none");
    }
  }, [planLanes]);
  // keep order in sync as the planning set changes (promote/demote)
  useEffect(() => {
    const ids = planLanes.map((l) => l.city.id);
    setOrder((prev) => {
      const kept = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !kept.includes(id));
      if (added.length === 0 && kept.length === prev.length) return prev;
      return [...kept, ...added];
    });
  }, [planLanes]);
  // Persist the manual order to planning_order (debounced) once the user has
  // actually dragged — never on the initial seed or promote/demote merges.
  const userReorderedRef = useRef(false);
  useEffect(() => {
    if (!userReorderedRef.current || !order.length) return;
    const t = setTimeout(() => {
      order.forEach((id, i) => updateCityRef.current(id, { planningOrder: i }));
    }, 400);
    return () => clearTimeout(t);
  }, [order]);
  const displayLanes = useMemo(() => {
    const lanes = [...planLanes];
    if (sortMode === "next") return lanes.sort((a, b) => a.start - b.start);
    if (sortMode === "best") return lanes.sort((a, b) => b.scoreNow - a.scoreNow);
    // "none" → manual order
    if (order.length) {
      const byId = new Map(lanes.map((l) => [l.city.id, l]));
      const out = [];
      for (const id of order) { const l = byId.get(id); if (l) { out.push(l); byId.delete(id); } }
      for (const l of lanes) if (byId.has(l.city.id)) out.push(l);
      return out;
    }
    return lanes;
  }, [planLanes, sortMode, order]);

  const [dragLaneId, setDragLaneId] = useState(null);
  function startLaneReorder(e, id) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    // dragging takes over ordering: snapshot the visible order, switch to manual
    const visible = [...document.querySelectorAll(".trip-pl-lanes .trip-pl-lane")]
      .map((el) => el.getAttribute("data-lane-id")).filter(Boolean);
    if (visible.length) setOrder(visible);
    setSortMode("none");
    userReorderedRef.current = true; // subsequent order changes now persist
    setDragLaneId(id);
    const move = (ev) => {
      const wrap = document.querySelector(".trip-pl-lanes");
      if (!wrap) return;
      const els = [...wrap.children].filter((c) => c.classList && c.classList.contains("trip-pl-lane"));
      let overId = null;
      for (const el of els) { const r = el.getBoundingClientRect(); if (ev.clientY < r.top + r.height / 2) { overId = el.getAttribute("data-lane-id"); break; } }
      setOrder((prev) => {
        if (prev.indexOf(id) < 0) return prev;
        const without = prev.filter((x) => x !== id);
        let to = overId ? without.indexOf(overId) : without.length;
        if (to < 0) to = without.length;
        const next = [...without.slice(0, to), id, ...without.slice(to)];
        return next.length === prev.length && next.every((v, i) => v === prev[i]) ? prev : next;
      });
    };
    const up = () => {
      setDragLaneId(null); // persistence handled by the debounced effect on `order`
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ── drag a backlog card → promote (drop on a lane's timeline sets the week) ─
  const [ghost, setGhost] = useState(null);
  function startCardDrag(e, c) {
    if (e.button !== undefined && e.button !== 0) return;
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    const name = (() => { const i = c.name.lastIndexOf(", "); return i > 0 ? c.name.slice(0, i) : c.name; })();
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
      moved = true;
      setGhost({ name, x: ev.clientX, y: ev.clientY });
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setGhost(null);
      const lanesWrap = document.querySelector(".trip-pl-lanes");
      const z = lanesWrap ? lanesWrap.getBoundingClientRect() : null;
      const overLanes = z && ev.clientY >= z.top - 8 && ev.clientY <= z.bottom + 40;
      if (!moved || overLanes) {
        const patch = { status: "Shortlist" };
        const lbody = moved ? document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".lbody") : null;
        if (lbody) {
          const r = lbody.getBoundingClientRect();
          const root = rootRef.current;
          const dayW = parseFloat(getComputedStyle(root).getPropertyValue("--day-w")) || DEFAULT_DAY_W;
          const panX = parseFloat(getComputedStyle(root).getPropertyValue("--pan-x")) || 0;
          let d = Math.round((ev.clientX - r.left - panX) / dayW);
          if (d < todayDay) d = todayDay;
          if (d + DEFAULT_TRIP_LEN > N) d = N - DEFAULT_TRIP_LEN;
          patch.arriveDate = toYmd(addDays(viewStart, d));
          patch.departDate = toYmd(addDays(viewStart, d + DEFAULT_TRIP_LEN - 1));
        }
        updateCity(c.id, patch);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ── ruler cells (months / weeks) ──────────────────────────────────────
  const monthCells = useMemo(() => {
    const out = [];
    const end = addDays(viewStart, N - 1);
    let probe = new Date(viewStart.getFullYear(), viewStart.getMonth(), 1);
    while (probe <= end) {
      const offset = daysBetween(viewStart, probe);
      const dim = new Date(probe.getFullYear(), probe.getMonth() + 1, 0).getDate();
      if (offset + dim > 0 && offset < N) {
        out.push({ off: offset, w: dim, name: MONTHS_LONG[probe.getMonth()], year: probe.getFullYear() });
      }
      probe = new Date(probe.getFullYear(), probe.getMonth() + 1, 1);
    }
    return out;
  }, [viewStart]);

  const weekCells = useMemo(() => {
    const out = [];
    for (let w = 0; w < WEEKS; w++) {
      const d = addDays(viewStart, w * 7);
      out.push({ off: w * 7, day: d.getDate(), mon: MONTHS_SHORT[d.getMonth()] });
    }
    return out;
  }, [viewStart]);

  // signature: rewire imperative handlers when the set of lanes changes
  const wiringKey = useMemo(
    () => [
      planLanes.map((l) => l.city.id).join(","),
      committedLanes.map((l) => l.city.id).join(","),
    ].join("|"),
    [planLanes, committedLanes],
  );

  // ── imperative interaction layer (pan / zoom / drag / hover) ───────────
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ruler = root.querySelector(".trip-pl-ruler");
    const S = { dayW: DEFAULT_DAY_W, panX: 0, TH: DEFAULT_TH, FEELS: false, CROWDS: false };
    let charts = null;

    const vw = () => (ruler ? ruler.clientWidth : root.clientWidth);
    const content = () => S.dayW * N;
    function clampPan() {
      const maxP = -(leftBound * S.dayW);
      const minP = Math.min(maxP, vw() - content());
      if (S.panX > maxP) S.panX = maxP;
      if (S.panX < minP) S.panX = minP;
    }
    function smoothPath(pts) {
      if (pts.length < 2) return pts.length ? `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}` : "";
      let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
        const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
        const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
        d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
      }
      return d;
    }
    function buildCharts() {
      charts = [];
      root.querySelectorAll(".trip-pl-lane:not(.is-planned)").forEach((lane) => {
        const svg = lane.querySelector(".trip-pl-chart");
        if (!svg || !lane.dataset.weeks) return;
        const ps = svg.querySelectorAll("path");
        const wk = JSON.parse(lane.dataset.weeks);
        charts.push({
          svg,
          grad: svg.querySelector("linearGradient"),
          thr: svg.querySelector(".thr"),
          scores: wk.map((w) => w.score),
          temps: wk.map((w) => (w.t == null ? 60 : w.t)),
          crowd: wk.map((w) => w.x),
          area: ps[0],
          line: ps[1],
          dot: svg.querySelector("circle"),
          feels: svg.querySelector(".feels"),
          cline: svg.querySelector(".cline"),
        });
      });
    }
    function redraw() {
      if (!charts) buildCharts();
      const W = S.dayW * N;
      const sD = -S.panX / S.dayW, eD = (-S.panX + vw()) / S.dayW;
      charts.forEach((lc) => {
        lc.svg.setAttribute("viewBox", `0 0 ${W} 100`);
        if (lc.grad) lc.grad.setAttribute("x2", W);
        if (lc.thr) {
          let ty = 100 - (S.TH - 30) / 65 * 100;
          if (ty < 2) ty = 2; if (ty > 98) ty = 98;
          lc.thr.setAttribute("x2", W);
          lc.thr.setAttribute("y1", ty.toFixed(1));
          lc.thr.setAttribute("y2", ty.toFixed(1));
        }
        const a = Math.max(0, Math.floor(sD / 7) - 1);
        const b = Math.min(lc.scores.length - 1, Math.ceil(eD / 7) + 1);
        if (b < a) return;
        const P = (arr, lo, hi) => {
          const o = [];
          for (let w = a; w <= b; w++) {
            const x = (w * 7 + 3.5) * S.dayW;
            let y = 100 - (arr[w] - lo) / (hi - lo) * 100;
            if (y < 4) y = 4; if (y > 96) y = 96;
            o.push([x, y]);
          }
          return o;
        };
        const sp = P(lc.scores, 30, 95);
        if (!sp.length) return;
        const L = smoothPath(sp);
        const x0 = sp[0][0].toFixed(1), x1 = sp[sp.length - 1][0].toFixed(1);
        lc.line.setAttribute("d", L);
        lc.area.setAttribute("d", `M ${x0},100 L ${L.slice(2)} L ${x1},100 Z`);
        let bi = a;
        for (let w = a; w <= b; w++) if (lc.scores[w] > lc.scores[bi]) bi = w;
        lc.dot.setAttribute("cx", ((bi * 7 + 3.5) * S.dayW).toFixed(1));
        lc.dot.setAttribute("cy", (100 - (lc.scores[bi] - 30) / 65 * 100).toFixed(1));
        lc.feels.style.display = S.FEELS ? "" : "none";
        if (S.FEELS) lc.feels.setAttribute("d", smoothPath(P(lc.temps, 35, 95)));
        lc.cline.style.display = S.CROWDS ? "" : "none";
        if (S.CROWDS) lc.cline.setAttribute("d", smoothPath(P(lc.crowd, 0, 5)));
      });
    }
    function apply() {
      root.style.setProperty("--day-w", S.dayW + "px");
      root.style.setProperty("--pan-x", S.panX + "px");
      redraw();
    }

    // initial pan: earliest-needed day at the left edge (today, or an
    // in-progress committed trip's start if it began before today)
    S.panX = -(leftBound * S.dayW);
    clampPan();
    apply();

    // ── zoom buttons ──
    const zoom = root.querySelector(".trip-pl-zoom");
    const onZoom = (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      zoom.querySelectorAll("button").forEach((x) => x.classList.remove("is-active"));
      btn.classList.add("is-active");
      const c = vw() / 2, da = (c - S.panX) / S.dayW;
      S.dayW = parseFloat(btn.dataset.w);
      S.panX = c - da * S.dayW;
      clampPan(); apply();
    };
    if (zoom) zoom.addEventListener("click", onZoom);

    // ── wheel pan / pinch zoom ──
    const onWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const r = ruler.getBoundingClientRect();
        const cx = e.clientX - r.left, da = (cx - S.panX) / S.dayW;
        S.dayW *= Math.exp(-e.deltaY * 0.01);
        if (S.dayW < MIN_DAY_W) S.dayW = MIN_DAY_W;
        if (S.dayW > MAX_DAY_W) S.dayW = MAX_DAY_W;
        S.panX = cx - da * S.dayW;
        clampPan(); apply();
        if (zoom) zoom.querySelectorAll("button").forEach((x) => x.classList.remove("is-active"));
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        S.panX -= e.deltaX; clampPan(); apply();
      }
    };
    root.addEventListener("wheel", onWheel, { passive: false });

    // ── ruler drag to pan ──
    let pan = null;
    const onRulerDown = (e) => {
      pan = { x: e.clientX, p: S.panX };
      ruler.classList.add("is-grabbing");
      window.addEventListener("pointermove", onPanMove);
      window.addEventListener("pointerup", onPanUp);
    };
    const onPanMove = (e) => { if (!pan) return; S.panX = pan.p + (e.clientX - pan.x); clampPan(); apply(); };
    const onPanUp = () => {
      pan = null; ruler.classList.remove("is-grabbing");
      window.removeEventListener("pointermove", onPanMove);
      window.removeEventListener("pointerup", onPanUp);
    };
    if (ruler) ruler.addEventListener("pointerdown", onRulerDown);

    // ── popovers ──
    const pop = document.createElement("div");
    pop.className = "trip-pl-pop";
    document.body.appendChild(pop);
    const fmt = (off, len) => {
      const s = addDays(viewStart, off), e = addDays(s, len); // check-out convention
      if (s.getMonth() === e.getMonth()) return `${MONTHS_SHORT[s.getMonth()]} ${s.getDate()}–${e.getDate()}`;
      return `${MONTHS_SHORT[s.getMonth()]} ${s.getDate()}–${MONTHS_SHORT[e.getMonth()]} ${e.getDate()}`;
    };
    const dayLabel = (day) => { const s = addDays(viewStart, day); return `${MONTHS_SHORT[s.getMonth()]} ${s.getDate()}`; };
    const bgUrl = (el) => {
      if (!el) return "";
      const m = getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
      return m ? m[1] : "";
    };
    const setHero = (url) => {
      if (!url) return;
      const h = document.createElement("div");
      h.className = "phero"; h.style.backgroundImage = `url("${url}")`;
      pop.appendChild(h);
    };
    const popRow = (k, v) => {
      const d = document.createElement("div"); d.className = "pr";
      const a = document.createElement("span"); a.className = "pk"; a.textContent = k;
      const b = document.createElement("span"); b.className = "pv"; b.textContent = v;
      d.appendChild(a); d.appendChild(b); pop.appendChild(d);
    };
    const place = (e) => {
      pop.style.display = "block";
      let px = e.clientX + 14, py = e.clientY + 14;
      if (px + 240 > innerWidth) px = e.clientX - 240;
      if (py + 220 > innerHeight) py = Math.max(8, e.clientY - 220);
      pop.style.left = px + "px"; pop.style.top = py + "px";
    };
    const hidePop = () => { pop.style.display = "none"; pop.className = "trip-pl-pop"; };

    function showWeek(lane, e) {
      pop.className = "trip-pl-pop";
      if (!lane.dataset.weeks) return;
      const weeks = JSON.parse(lane.dataset.weeks);
      const r = lane.querySelector(".trip-pl-chart").getBoundingClientRect();
      const wi = Math.floor(((e.clientX - r.left) / S.dayW) / 7);
      if (wi < 0 || wi >= weeks.length) { pop.style.display = "none"; return; }
      const wk = weeks[wi];
      pop.textContent = "";
      const cy = document.createElement("div"); cy.className = "pcity"; cy.textContent = lane.dataset.city; pop.appendChild(cy);
      const h = document.createElement("h4");
      const t = document.createElement("span"); t.textContent = "Week of " + wk.label;
      const s = document.createElement("span"); s.className = "ps"; s.textContent = wk.score;
      h.appendChild(t); h.appendChild(s); pop.appendChild(h);
      popRow("High / Low", wk.t == null ? "—" : `${wk.t}° / ${wk.lo}°F`);
      popRow("Rain days", `~${wk.precip} / wk`);
      popRow("Daylight", wk.day + " h");
      popRow("Crowds", CROWD_WORD[wk.x] || "—");
      place(e);
    }
    function showTrip(bar, e) {
      pop.className = "trip-pl-pop";
      const lane = bar.closest(".trip-pl-lane");
      if (!lane.dataset.weeks) return;
      const weeks = JSON.parse(lane.dataset.weeks);
      const off = +bar.dataset.start, len = +bar.dataset.len;
      const a = Math.max(0, Math.floor(off / 7)), b = Math.min(weeks.length - 1, Math.floor((off + len - 1) / 7));
      let st = 0, sx = 0, ss = 0, n = 0;
      for (let w = a; w <= b; w++) { st += weeks[w].t || 0; sx += weeks[w].x; ss += weeks[w].score; n++; }
      n = n || 1;
      pop.textContent = "";
      setHero(bgUrl(lane.querySelector(".lthumb")));
      const cy = document.createElement("div"); cy.className = "pcity"; cy.textContent = "Your trip · " + lane.dataset.city; pop.appendChild(cy);
      const h = document.createElement("h4");
      const t = document.createElement("span"); t.textContent = fmt(off, len);
      const s = document.createElement("span"); s.className = "ps"; s.textContent = Math.round(ss / n);
      h.appendChild(t); h.appendChild(s); pop.appendChild(h);
      popRow("Length", len + " nights");
      popRow("Avg high", Math.round(st / n) + "°F");
      popRow("Crowds", CROWD_WORD[Math.round(sx / n)] || "—");
      popRow("Visit score", Math.round(ss / n) + " / 100");
      const nn = document.createElement("div"); nn.className = "pnote"; nn.textContent = "Double-click the box to edit dates";
      pop.appendChild(nn);
      place(e);
    }
    function showPlanned(bar, e) {
      const weeks = bar.dataset.weeks ? JSON.parse(bar.dataset.weeks) : null;
      const off = +bar.dataset.start, len = +bar.dataset.len, city = bar.dataset.city || "";
      const a = Math.max(0, Math.floor(off / 7)), b = weeks ? Math.min(weeks.length - 1, Math.floor((off + len - 1) / 7)) : a;
      let hi = 0, lo = 0, xa = 0, pr = 0, dl = 0, n = 0;
      if (weeks) for (let w = a; w <= b; w++) { hi += weeks[w].t || 0; lo += weeks[w].lo || 0; xa += weeks[w].x; pr += weeks[w].precip; dl += parseFloat(weeks[w].day) || 0; n++; }
      n = n || 1;
      hi = Math.round(hi / n); lo = Math.round(lo / n); xa = Math.round(xa / n);
      pr = Math.round(pr * len / 7); dl = (dl / n).toFixed(0);
      const days = off - todayDay;
      const count = days > 1 ? `In ${days} days` : days === 1 ? "Tomorrow" : days === 0 ? "Today" : "Under way";
      pop.className = "trip-pl-pop ready"; pop.textContent = "";
      setHero(bgUrl(bar.querySelector(".trip-pl-thumb")));
      const cnt = document.createElement("div"); cnt.className = "pcount"; cnt.textContent = "Committed · " + count; pop.appendChild(cnt);
      const h = document.createElement("h4");
      const t = document.createElement("span"); t.textContent = city;
      const s = document.createElement("span"); s.className = "ps"; s.textContent = len + " nights";
      h.appendChild(t); h.appendChild(s); pop.appendChild(h);
      popRow("When", fmt(off, len));
      popRow("Weather", hi + "° / " + lo + "°F");
      popRow("Rain", "~" + pr + " day" + (pr === 1 ? "" : "s") + " over the trip");
      popRow("Daylight", dl + " h");
      popRow("Crowds", CROWD_WORD[xa] || "—");
      const pk = document.createElement("div"); pk.className = "ppack";
      const k = document.createElement("span"); k.className = "pk"; k.textContent = "Pack";
      const v = document.createElement("span"); v.className = "pv2"; v.textContent = packFor(hi, Math.round(pr * 7 / Math.max(1, len)));
      pk.appendChild(k); pk.appendChild(v); pop.appendChild(pk);
      place(e);
    }

    // ── trip box: render + persist ──
    function update(bar, off, len) {
      bar.style.left = `calc(var(--day-w)*${off})`;
      bar.style.width = `calc(var(--day-w)*${len})`;
      bar.dataset.start = off; bar.dataset.len = len;
      const dt = bar.querySelector(".bdates"); if (dt) dt.textContent = fmt(off, len);
      const sub = bar.querySelector(".bsub");
      const lane = bar.closest(".trip-pl-lane");
      if (sub) {
        sub.textContent = "";
        const nt = document.createElement("span"); nt.className = "bnt"; nt.textContent = len + " nt"; sub.appendChild(nt);
        if (lane && lane.dataset.weeks) {
          const weeks = JSON.parse(lane.dataset.weeks);
          const wi = Math.max(0, Math.min(weeks.length - 1, Math.floor((off + Math.floor(len / 2)) / 7)));
          const wk = weeks[wi];
          if (wk.t != null) {
            const d1 = document.createElement("span"); d1.className = "bdim"; d1.textContent = " · "; sub.appendChild(d1);
            const tp = document.createElement("span"); tp.className = "bctemp"; tp.textContent = wk.t + "°F"; sub.appendChild(tp);
          }
          const d2 = document.createElement("span"); d2.className = "bdim"; d2.textContent = " · "; sub.appendChild(d2);
          sub.appendChild(document.createTextNode(CROWD_WORD[wk.x] || "—"));
        }
      }
    }
    function persist(bar) {
      const start = +bar.dataset.start, len = +bar.dataset.len, id = bar.dataset.cityId;
      const arr = toYmd(addDays(viewStart, start));
      const dep = toYmd(addDays(viewStart, start + len - 1)); // inclusive last night
      updateCityRef.current(id, { arriveDate: arr, departDate: dep });
    }
    function panToDay(day) { S.panX = -(day * S.dayW) + vw() * 0.28; clampPan(); apply(); }

    // ── jump to next/prev qualifying week ──
    function findJump(bar, dir) {
      const lane = bar.closest(".trip-pl-lane");
      if (!lane || !lane.dataset.weeks) return null;
      const sc = JSON.parse(lane.dataset.weeks).map((w) => w.score);
      const sw = Math.floor(+bar.dataset.start / 7);
      let i, target = null;
      if (dir > 0) {
        i = sw; while (i < sc.length && sc[i] >= S.TH) i++; while (i < sc.length && sc[i] < S.TH) i++;
        if (i < sc.length) target = i;
      } else {
        i = sw - 1; while (i >= 0 && sc[i] >= S.TH) i--; while (i >= 0 && sc[i] < S.TH) i--;
        const end = i; while (i >= 0 && sc[i] >= S.TH) i--; if (end >= 0) target = i + 1;
      }
      if (target === null) return null;
      if (target * 7 < todayDay) return null;
      return { week: target, off: target * 7, score: sc[target], delta: target - sw };
    }
    function doJump(bar, dir) {
      const t = findJump(bar, dir); if (!t) return;
      const len = +bar.dataset.len; let off = t.off;
      if (off + len > N) off = N - len; if (off < todayDay) off = todayDay;
      update(bar, off, len); persist(bar); panToDay(off); hidePop();
    }
    function previewJump(btn, e) {
      pop.className = "trip-pl-pop";
      const bar = btn.closest(".trip-pl-bar");
      const dir = btn.classList.contains("bj-r") ? 1 : -1;
      const t = findJump(bar, dir);
      pop.textContent = "";
      const cy = document.createElement("div"); cy.className = "pcity"; cy.textContent = dir > 0 ? "Jump later" : "Jump earlier"; pop.appendChild(cy);
      const h = document.createElement("h4");
      const ti = document.createElement("span");
      if (!t) { ti.textContent = (dir > 0 ? "No later week " : "No earlier week ") + "≥ " + S.TH; h.appendChild(ti); pop.appendChild(h); }
      else {
        ti.textContent = "Week of " + dayLabel(t.off);
        const s = document.createElement("span"); s.className = "ps"; s.textContent = t.score;
        h.appendChild(ti); h.appendChild(s); pop.appendChild(h);
        const d = document.createElement("div"); d.className = "pr";
        const k = document.createElement("span"); k.className = "pk"; k.textContent = "Distance";
        const v = document.createElement("span"); v.className = "pv";
        v.textContent = Math.abs(t.delta) + " week" + (Math.abs(t.delta) === 1 ? "" : "s") + (dir > 0 ? " later" : " earlier");
        d.appendChild(k); d.appendChild(v); pop.appendChild(d);
      }
      pop.style.display = "block";
      let px = e.clientX + 14, py = e.clientY + 14;
      if (px + 220 > innerWidth) px = e.clientX - 220;
      pop.style.left = px + "px"; pop.style.top = py + "px";
    }

    // ── date editor (double-click) ──
    const editor = document.createElement("div"); editor.className = "trip-pl-editor";
    const etitle = document.createElement("div"); etitle.className = "etitle"; editor.appendChild(etitle);
    const r1 = document.createElement("div"); r1.className = "er";
    const l1 = document.createElement("label"); l1.textContent = "Start";
    const si = document.createElement("input"); si.type = "date";
    r1.appendChild(l1); r1.appendChild(si); editor.appendChild(r1);
    const r2 = document.createElement("div"); r2.className = "er";
    const l2 = document.createElement("label"); l2.textContent = "Nights";
    const ni = document.createElement("input"); ni.type = "number"; ni.min = "1"; ni.max = "60";
    r2.appendChild(l2); r2.appendChild(ni); editor.appendChild(r2);
    const eb = document.createElement("div"); eb.className = "eb";
    const cancel = document.createElement("button"); cancel.className = "cancel"; cancel.textContent = "Cancel";
    const ok = document.createElement("button"); ok.className = "ok"; ok.textContent = "Apply";
    eb.appendChild(cancel); eb.appendChild(ok); editor.appendChild(eb);
    document.body.appendChild(editor);
    let editBar = null;
    function openEditor(bar) {
      editBar = bar;
      const off = +bar.dataset.start, len = +bar.dataset.len;
      etitle.textContent = bar.closest(".trip-pl-lane").dataset.city;
      si.value = toYmd(addDays(viewStart, off));
      si.min = toYmd(addDays(viewStart, todayDay));
      ni.value = len;
      editor.style.display = "block";
      const bx = bar.getBoundingClientRect();
      let x = bx.left, y = bx.bottom + 8;
      if (x + 220 > innerWidth) x = innerWidth - 228;
      if (y + 160 > innerHeight) y = bx.top - 168;
      editor.style.left = x + "px"; editor.style.top = y + "px";
      si.focus();
    }
    function closeEditor() { editor.style.display = "none"; editBar = null; }
    cancel.addEventListener("click", closeEditor);
    ok.addEventListener("click", () => {
      if (!editBar) return;
      let off = daysBetween(viewStart, fromYmd(si.value) || addDays(viewStart, todayDay));
      let len = parseInt(ni.value, 10) || 1; if (len < 1) len = 1;
      if (off < todayDay) off = todayDay; if (off + len > N) off = N - len;
      update(editBar, off, len); persist(editBar); panToDay(off); closeEditor();
    });
    const onDocDown = (e) => {
      if (editor.style.display === "block" && !editor.contains(e.target) && !e.target.closest(".trip-pl-bar")) closeEditor();
    };
    document.addEventListener("pointerdown", onDocDown);

    // ── wire planning lanes: chart hover + box drag/resize/jump/dblclick ──
    const chartHandlers = [];
    root.querySelectorAll(".trip-pl-lane:not(.is-planned)").forEach((lane) => {
      const chart = lane.querySelector(".trip-pl-chart");
      if (!chart) return;
      const mm = (e) => showWeek(lane, e);
      const ml = () => { pop.style.display = "none"; };
      chart.addEventListener("mousemove", mm);
      chart.addEventListener("mouseleave", ml);
      chartHandlers.push([chart, mm, ml]);
    });

    let drag = null;
    const onBarDown = (e) => {
      const bar = e.currentTarget;
      if (e.target.closest(".bjump") || e.target.closest(".bcommit")) return;
      const h = e.target.closest(".bhandle");
      e.preventDefault(); e.stopPropagation();
      drag = { bar, mode: h ? (h.classList.contains("l") ? "l" : "r") : "move", x: e.clientX, s: +bar.dataset.start, l: +bar.dataset.len };
      bar.classList.add("is-dragging");
      window.addEventListener("pointermove", onBarMove);
      window.addEventListener("pointerup", onBarUp);
    };
    const onBarMove = (e) => {
      if (!drag) return;
      const dd = Math.round((e.clientX - drag.x) / S.dayW);
      let s = drag.s, l = drag.l;
      if (drag.mode === "move") s = drag.s + dd;
      else if (drag.mode === "l") { s = drag.s + dd; l = drag.l - dd; }
      else l = drag.l + dd;
      if (l < 1) l = 1;
      if (s < todayDay) { if (drag.mode === "l") l = drag.s + drag.l - todayDay; s = todayDay; }
      if (s + l > N) { if (drag.mode === "move") s = N - l; else l = N - s; }
      update(drag.bar, s, l);
    };
    const onBarUp = () => {
      if (!drag) return;
      drag.bar.classList.remove("is-dragging");
      persist(drag.bar);
      drag = null;
      window.removeEventListener("pointermove", onBarMove);
      window.removeEventListener("pointerup", onBarUp);
    };

    const barHandlers = [];
    root.querySelectorAll(".trip-pl-lane:not(.is-planned) .trip-pl-bar").forEach((bar) => {
      const mm = (e) => showTrip(bar, e);
      const ml = () => { pop.style.display = "none"; };
      const db = (e) => { e.preventDefault(); e.stopPropagation(); openEditor(bar); };
      bar.addEventListener("pointerdown", onBarDown);
      bar.addEventListener("mousemove", mm);
      bar.addEventListener("mouseleave", ml);
      bar.addEventListener("dblclick", db);
      barHandlers.push([bar, mm, ml, db]);
      update(bar, +bar.dataset.start, +bar.dataset.len);
    });

    const jumpHandlers = [];
    root.querySelectorAll(".trip-pl-lane:not(.is-planned) .bjump").forEach((btn) => {
      const pd = (e) => { e.preventDefault(); e.stopPropagation(); };
      const mm = (e) => { e.stopPropagation(); previewJump(btn, e); };
      const ml = () => { pop.style.display = "none"; };
      const ck = (e) => { e.preventDefault(); e.stopPropagation(); doJump(btn.closest(".trip-pl-bar"), btn.classList.contains("bj-r") ? 1 : -1); };
      btn.addEventListener("pointerdown", pd);
      btn.addEventListener("mousemove", mm);
      btn.addEventListener("mouseleave", ml);
      btn.addEventListener("click", ck);
      jumpHandlers.push([btn, pd, mm, ml, ck]);
    });

    const plannedHandlers = [];
    root.querySelectorAll(".trip-pl-lane.is-planned .trip-pl-bar").forEach((bar) => {
      const mm = (e) => showPlanned(bar, e);
      const ml = () => hidePop();
      bar.addEventListener("mousemove", mm);
      bar.addEventListener("mouseleave", ml);
      plannedHandlers.push([bar, mm, ml]);
    });

    // ── toggles + threshold ──
    const tFeels = root.querySelector("#tpFeels");
    const tCrowds = root.querySelector("#tpCrowds");
    const thresh = root.querySelector("#tpThresh");
    const onFeels = (e) => { S.FEELS = e.target.checked; redraw(); };
    const onCrowds = (e) => { S.CROWDS = e.target.checked; redraw(); };
    const onThresh = (e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) { S.TH = v; redraw(); } };
    if (tFeels) tFeels.addEventListener("change", onFeels);
    if (tCrowds) tCrowds.addEventListener("change", onCrowds);
    if (thresh) thresh.addEventListener("input", onThresh);

    const onResize = () => { clampPan(); apply(); };
    window.addEventListener("resize", onResize);

    // ── cleanup ──
    return () => {
      if (zoom) zoom.removeEventListener("click", onZoom);
      root.removeEventListener("wheel", onWheel);
      if (ruler) ruler.removeEventListener("pointerdown", onRulerDown);
      window.removeEventListener("pointermove", onPanMove);
      window.removeEventListener("pointerup", onPanUp);
      window.removeEventListener("pointermove", onBarMove);
      window.removeEventListener("pointerup", onBarUp);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("pointerdown", onDocDown);
      chartHandlers.forEach(([el, mm, ml]) => { el.removeEventListener("mousemove", mm); el.removeEventListener("mouseleave", ml); });
      barHandlers.forEach(([el, mm, ml, db]) => { el.removeEventListener("pointerdown", onBarDown); el.removeEventListener("mousemove", mm); el.removeEventListener("mouseleave", ml); el.removeEventListener("dblclick", db); });
      jumpHandlers.forEach(([el, pd, mm, ml, ck]) => { el.removeEventListener("pointerdown", pd); el.removeEventListener("mousemove", mm); el.removeEventListener("mouseleave", ml); el.removeEventListener("click", ck); });
      plannedHandlers.forEach(([el, mm, ml]) => { el.removeEventListener("mousemove", mm); el.removeEventListener("mouseleave", ml); });
      if (tFeels) tFeels.removeEventListener("change", onFeels);
      if (tCrowds) tCrowds.removeEventListener("change", onCrowds);
      if (thresh) thresh.removeEventListener("input", onThresh);
      pop.remove(); editor.remove();
    };
  }, [wiringKey, todayDay, viewStart, leftBound]);

  // ── render helpers ────────────────────────────────────────────────────
  function heroFor(cityItem) {
    const q = cityImageQuery(cityItem.name, cityItem.stayZone, cityItem.heartIntersection);
    return resolveImage(cityItem.heroImage, q, imageState);
  }
  function laneChart(weeks, gid) {
    if (!weeks) return null;
    const stops = weeks.map((wk, w) => (
      <stop key={w} offset={`${((w * 7 + 3.5) / N * 100).toFixed(2)}%`} stopColor={scoreColor(wk.score)} />
    ));
    return (
      <svg className="trip-pl-chart" viewBox={`0 0 ${N} 100`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={N} y2="0">{stops}</linearGradient>
        </defs>
        <path className="area" fill={`url(#${gid})`} d="" />
        <path className="line" fill="none" stroke="#3f6a30" strokeWidth="1.5" vectorEffect="non-scaling-stroke" d="" />
        <line className="thr" x1="0" x2={N} y1="50" y2="50" stroke="#8a5a22" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path className="feels" fill="none" stroke="#c2823f" strokeWidth="1.5" vectorEffect="non-scaling-stroke" style={{ display: "none" }} d="" />
        <path className="cline" fill="none" stroke="#5b7a99" strokeWidth="1.5" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" style={{ display: "none" }} d="" />
        <circle className="dot" r="3.5" fill="#2f4a23" cx="-10" cy="50" />
      </svg>
    );
  }

  const hasPlanning = planLanes.length > 0;

  return (
    <AppShell activeMode="visit">
      <section className="canvas-header trip-pl-head">
        <div>
          <p className="page-eyebrow">Visit · Planner</p>
          <h1>Trip planner</h1>
          <p className="canvas-sub">
            Each city is a lane — the fill shows its <strong>visit score</strong> across the year; slide the white box to the best week.
          </p>
        </div>
        <div className="trip-pl-head-ctl">
          <Link className="ghost-link" href="/visit/planned">Planned trips →</Link>
          <div className="trip-pl-zoom" role="group" aria-label="Zoom">
            <button type="button" data-w="9">Season</button>
            <button type="button" data-w="12">Months</button>
            <button type="button" data-w="16" className="is-active">Weeks</button>
            <button type="button" data-w="30">Days</button>
          </div>
        </div>
      </section>

      <div className="trip-pl" ref={rootRef}>
        {/* ruler */}
        <div className="trip-pl-timeline">
          <div className="trip-pl-corner"><span>{viewStart.getFullYear()} · drag to pan · pinch to zoom</span></div>
          <div className="trip-pl-ruler">
            <div className="trip-pl-scroller">
              <div className="trip-pl-months">
                {monthCells.map((m, i) => (
                  <div key={i} className="mcell" style={{ left: `calc(var(--day-w) * ${m.off})`, width: `calc(var(--day-w) * ${m.w})` }}>
                    <span className="mname">{m.name}</span> <span className="myr">{m.year}</span>
                  </div>
                ))}
              </div>
              <div className="trip-pl-weeks">
                {weekCells.map((w, i) => (
                  <div key={i} className="wcell" style={{ left: `calc(var(--day-w) * ${w.off})`, width: "var(--week-w)" }}>
                    <span className="wd">{w.day}</span><span className="wm">{w.mon}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Planned */}
        <div className="trip-pl-section">
          <div className="st"><span className="eyebrow">Planned</span><h2>Committed trips</h2><span className="sub">{!hydrated ? "Loading…" : committedLanes.length ? "Locked in." : "Nothing committed yet."}</span></div>
        </div>
        <div className="trip-pl-lane is-planned">
          <div className="llabel" />
          <div className="lbody">
            <div className="trip-pl-scroller">
              <div className="track planned-track" style={{ height: 12 + committedRows * 48 }}>
                <div className="trip-pl-today" style={{ left: `calc(var(--day-w)*${todayDay})` }} />
                {committedLanes.map((l) => {
                  const hero = heroFor(l.city);
                  return (
                    <div
                      key={l.city.id}
                      className="trip-pl-bar is-planned"
                      data-city={l.city.name}
                      data-city-id={l.city.id}
                      data-start={l.start}
                      data-len={l.len}
                      data-weeks={l.weeks ? JSON.stringify(l.weeks) : ""}
                      style={{ left: `calc(var(--day-w)*${l.start})`, width: `calc(var(--day-w)*${l.len})`, top: 6 + l.row * 48, transform: "none" }}
                    >
                      <span className="trip-pl-thumb" style={hero ? { backgroundImage: `url(${hero})` } : undefined}>{hero ? "" : l.city.name.slice(0, 1)}</span>
                      <span className="btext">
                        <span className="bname">{l.city.name}</span>
                        <span className="bdates">{fmtRange(viewStart, l.start, l.len)}</span>
                      </span>
                      <button
                        type="button"
                        className="bcommit unlock"
                        title="Move back to planning"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => updateCity(l.city.id, { status: "" })}
                      >↩</button>
                    </div>
                  );
                })}
                {hydrated && committedLanes.length === 0 ? <div className="trip-pl-empty-inline">Commit a planning trip (✓) to lock it in here.</div> : null}
              </div>
            </div>
          </div>
        </div>

        {/* Planning */}
        <div className="trip-pl-section">
          <div className="st">
            <span className="eyebrow">Planning</span><h2>Cities looking for a slot</h2>
            <div className="plan-ctl">
              <div className="sortctl" role="group" aria-label="Sort lanes">
                <span className="sortlbl">Sort</span>
                <button type="button" className={sortMode === "none" ? "on" : ""} onClick={() => setSortMode("none")}>None</button>
                <button type="button" className={sortMode === "next" ? "on" : ""} onClick={() => setSortMode("next")}>Next trip</button>
                <button type="button" className={sortMode === "best" ? "on" : ""} onClick={() => setSortMode("best")} title="Highest visit score this week">Best now</button>
              </div>
              <div className="togs">
                <label className="tog"><input type="checkbox" id="tpFeels" /> <span style={{ color: "#a8651c" }}>Feels-like</span></label>
                <label className="tog"><input type="checkbox" id="tpCrowds" /> <span style={{ color: "#3f5d7a" }}>Crowds</span></label>
              </div>
              <div className="thctl">Jump to weeks scoring ≥ <input id="tpThresh" type="number" min="0" max="100" step="5" defaultValue={DEFAULT_TH} /></div>
            </div>
          </div>
        </div>

        <div className="trip-pl-key">
          <span><span className="kdot" /> best week</span>
          <span><span className="kfill" /> fill = <strong>visit score</strong> 0–100</span>
          <span><span className="kthr" /> your ≥ threshold</span>
          <span>hover any week or box for numbers</span>
        </div>

        <div className="trip-pl-lanes">
          {hasPlanning ? displayLanes.map((l) => {
            const hero = heroFor(l.city);
            const gid = `tpg-${l.city.id}`;
            const best = l.weeks ? l.weeks.reduce((a, b) => (b.score > a.score ? b : a)) : null;
            return (
              <div
                key={l.city.id}
                className={`trip-pl-lane${dragLaneId === l.city.id ? " lane-dragging" : ""}`}
                data-city={l.city.name}
                data-lane-id={l.city.id}
                data-weeks={l.weeks ? JSON.stringify(l.weeks) : ""}
              >
                <div className="llabel">
                  <span className="lgrip" title="Drag to reorder" onPointerDown={(e) => startLaneReorder(e, l.city.id)}>⠿</span>
                  <span className="lthumb" style={hero ? { backgroundImage: `url(${hero})` } : undefined}>{hero ? "" : l.city.name.slice(0, 1)}</span>
                  <span className="ltext">
                    <span className="lcity">{l.city.name}</span>
                    {best ? <span className="lrec">Best score {best.score} · week of {best.label}</span> : <span className="lrec lmuted">conditions not measured</span>}
                  </span>
                  <button
                    type="button"
                    className="ldemote"
                    title="Remove from planning"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setConfirmId(confirmId === l.city.id ? null : l.city.id)}
                  >×</button>
                  {confirmId === l.city.id ? (
                    <div className="ldemote-confirm" onPointerDown={(e) => e.stopPropagation()}>
                      <span className="ldc-msg">Remove <b>{l.city.name.replace(/,.*/, "")}</b> from planning?</span>
                      <div className="ldc-actions">
                        <button type="button" className="ldc-yes" onClick={() => { updateCity(l.city.id, { status: "Idea", arriveDate: "", departDate: "" }); setConfirmId(null); }}>Remove</button>
                        <button type="button" className="ldc-no" onClick={() => setConfirmId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="lbody">
                  <div className="trip-pl-scroller">
                    <div className="track">
                      {laneChart(l.weeks, gid)}
                      <div className="trip-pl-today" style={{ left: `calc(var(--day-w)*${todayDay})` }} />
                      <div
                        className="trip-pl-bar"
                        data-city-id={l.city.id}
                        data-start={l.start}
                        data-len={l.len}
                        style={{ left: `calc(var(--day-w)*${l.start})`, width: `calc(var(--day-w)*${l.len})` }}
                      >
                        <button type="button" className="bjump bj-l" title="Jump to previous qualifying week">‹</button>
                        <button type="button" className="bjump bj-r" title="Jump to next qualifying week">›</button>
                        <span className="bhandle l" />
                        <span className="btext">
                          <span className="bdates">{fmtRange(viewStart, l.start, l.len)}</span>
                          <span className="bsub"><span className="bnt">{l.len} nt</span></span>
                        </span>
                        <span className="bhandle r" />
                        <button
                          type="button"
                          className="bcommit"
                          title="Commit this trip"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => updateCity(l.city.id, {
                            status: "Scheduled",
                            arriveDate: toYmd(addDays(viewStart, l.start)),
                            departDate: toYmd(addDays(viewStart, l.start + l.len - 1)),
                          })}
                        >✓</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          }) : !hydrated ? (
            <div className="trip-pl-empty">
              <p>Loading…</p>
            </div>
          ) : (
            <div className="trip-pl-empty">
              <p>No cities in planning yet.</p>
              <p className="trip-pl-empty-sub">Promote one from the backlog below.</p>
            </div>
          )}
        </div>

        {/* Backlog */}
        <section className="trip-pl-backlog">
          <div className="bh"><span className="eyebrow">Backlog</span><h2>Not yet in planning</h2><span className="sub">{!hydrated ? "Loading…" : backlog.length ? "Promote to add a lane." : "Empty."}</span></div>
          <div className="bl">
            {backlog.map((c) => {
              const hero = heroFor(c);
              const lastComma = c.name.lastIndexOf(", ");
              const base = lastComma > 0 ? c.name.slice(0, lastComma) : c.name;
              const st = lastComma > 0 ? c.name.slice(lastComma + 2) : "";
              return (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  className="bk"
                  title="Drag onto a lane, or click, to promote"
                  onPointerDown={(e) => startCardDrag(e, c)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); updateCity(c.id, { status: "Shortlist" }); } }}
                >
                  <span className="bkt" style={hero ? { backgroundImage: `url(${hero})` } : undefined}>{hero ? "" : base.slice(0, 1)}</span>
                  <span className="bkb">
                    <span className="bkc">{base}</span>
                    <span className="bks">{st ? `${st} · ` : ""}drag up ↑</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {ghost ? (
          <div className="trip-pl-ghost" style={{ left: ghost.x + 14, top: ghost.y + 14 }}>{ghost.name}</div>
        ) : null}
      </div>
    </AppShell>
  );
}

function fmtRange(viewStart, off, len) {
  const s = addDays(viewStart, off), e = addDays(s, len); // check-out convention
  if (s.getMonth() === e.getMonth()) return `${MONTHS_SHORT[s.getMonth()]} ${s.getDate()}–${e.getDate()}`;
  return `${MONTHS_SHORT[s.getMonth()]} ${s.getDate()}–${MONTHS_SHORT[e.getMonth()]} ${e.getDate()}`;
}
