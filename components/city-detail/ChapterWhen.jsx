// Chapter V — When to go. Everything here is computed from the city's real
// monthly normals (visitClimate) and derived comfort/visit series — never the
// mockup's hand-pinned Newport numbers. When a city has no climate data yet we
// render an honest "pending" stub instead of a fabricated chart.

import { Fragment } from "react";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const X = (i) => 60 + i * (960 / 11);

export default function ChapterWhen({ view, homebase }) {
  const climate = Array.isArray(view.visitClimate) && view.visitClimate.length === 12 ? view.visitClimate : null;

  if (!climate) {
    return (
      <section id="when" className="when" aria-label="When to visit">
        <div className="when-inner">
          <div className="when-head">
            <h2>When to go</h2>
            <p className="sub">Awaiting climate normals for {view.name}. Once the pipeline measures them, the comfort ribbon, the year-shape, and the charm / off-season windows compute here.</p>
          </div>
        </div>
      </section>
    );
  }

  const comfort = view.monthlyComfort || [];           // 0–10 per month | null
  const crowd = Array.isArray(view.crowdSeason) ? view.crowdSeason : null; // 0–5 SHAPE | null
  const intensity = Number.isFinite(view.crowdIntensity) ? view.crowdIntensity : null; // 0–5 MAGNITUDE | null
  const nowIdx = new Date().getMonth();
  const vw = view.visitWindow;
  // Render the crowd line muted when the city has little overall tourist
  // saturation — the shape still computes, but a confident red ribbon for
  // Pittsburgh would mislead. intensity 0-1 = muted, 2-3 = normal, 4-5 = bold.
  const crowdClass = intensity == null ? "" : intensity <= 1 ? " low-intensity" : intensity >= 4 ? " high-intensity" : "";
  const intensityLabel = intensity == null ? null :
    intensity <= 1 ? "Low" : intensity <= 2 ? "Modest" : intensity <= 3 ? "Notable" : "Heavy";

  // Visit-worth synthesis: comfort minus a fraction of crowd pressure (when
  // we know it), weighted by overall tourist intensity. A peak-crowd month in
  // a high-intensity city (Bar Harbor in July) penalizes visit timing far
  // more than a peak-crowd month in a low-intensity city (Pittsburgh in
  // July). With no crowd data the verdict line IS the comfort line.
  const visit = comfort.map((c, i) => {
    if (c == null) return null;
    const pen = crowd && Number.isFinite(crowd[i])
      ? 0.35 * crowd[i] * 2 * (intensity == null ? 0.6 : intensity / 5)
      : 0;
    return Math.max(0, Math.min(10, c - pen));
  });

  const yC = (v) => 280 - v * 20;          // comfort/visit 0–10 → 200px band
  // Crowd y-mapping: 0–5 across 200px, but SCALED BY INTENSITY so the visual
  // amplitude is honest. Asheville (intensity 2) has the same monthly shape
  // as Bar Harbor (intensity 5) — but rendering both at full chart height
  // would mislead. With this scaling: Bar Harbor peak hits 200px, Asheville
  // peak hits 80px (2/5 of band), Pittsburgh (intensity 0) sits flat.
  // Default to 0.6 when intensity is unknown — generic-tourist-town look.
  const amplitude = intensity == null ? 0.6 : intensity / 5;
  const yCrowd = (v) => 280 - v * 40 * amplitude;

  return (
    <section id="when" className="when" aria-label="When to visit">
      <div className="when-inner">
        <div className="when-head">
          <h2>When to go</h2>
          <p className="sub">Climate comfort{crowd ? " and tourist crowd" : ""} plotted across the calendar year. The best visit windows are months with high comfort{crowd ? " and low crowd" : ""}.</p>
        </div>

        <div className="climate" aria-label="Monthly climate comfort vs tourist crowd density">
          <svg viewBox="0 0 1080 320" preserveAspectRatio="none" role="img">
            <defs>
              <linearGradient id="comfortGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0d4c44" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#0d4c44" stopOpacity="0.06" />
              </linearGradient>
              <linearGradient id="crowdGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a23a30" stopOpacity="0.30" />
                <stop offset="100%" stopColor="#a23a30" stopOpacity="0.04" />
              </linearGradient>
            </defs>

            {[80, 130, 180, 230].map((y) => <line key={y} className="grid-rule" x1="60" y1={y} x2="1020" y2={y} />)}
            <line className="axis-rule" x1="60" y1="280" x2="1020" y2="280" />
            <text className="axis-label" x="1020" y="56" textAnchor="end">↑ Score 0 – 10</text>

            <path className="comfort-area" fill="url(#comfortGrad)" d={areaPath(comfort, yC)} />
            {crowd ? <path className={`crowd-area${crowdClass}`} fill="url(#crowdGrad)" d={areaPath(crowd, yCrowd)} /> : null}
            <path className="comfort-stroke" d={linePath(comfort, yC)} />
            {crowd ? <path className={`crowd-stroke${crowdClass}`} d={linePath(crowd, yCrowd)} /> : null}
            <path className="visit-stroke" d={linePath(visit, yC)} />

            <line className="now-line" x1={X(nowIdx)} y1="40" x2={X(nowIdx)} y2="282" />
            <g transform={`translate(${X(nowIdx)}, 30)`}>
              <text className="now-pill" textAnchor="middle">Now</text>
            </g>

            {vw?.charm ? <Annotation idx={vw.charm.idx} y={yC(comfort[vw.charm.idx] ?? 0)} cls="charm" label="Charm visit" sub={`${MONTHS[vw.charm.idx]} — comfortable, crowds thinned`} /> : null}
            {vw?.truth ? <Annotation idx={vw.truth.idx} y={yC(comfort[vw.truth.idx] ?? 0)} cls="truth" label="Off-season visit" sub={`${MONTHS[vw.truth.idx]} — coldest, quietest test`} /> : null}

            <g>{dots(comfort, yC, "comfort", nowIdx)}</g>
            {crowd ? <g>{dots(crowd, yCrowd, "crowd", nowIdx)}</g> : null}
            <g>{dots(visit, yC, "visit", nowIdx)}</g>

            <g>{valueLabels(comfort, yC, "comfort-val", -10, (v) => v.toFixed(1))}</g>

            {MONTHS.map((mo, i) => (
              <text key={mo} className={`month-label${i === nowIdx ? " now" : ""}`} x={X(i)} y="296">{mo}</text>
            ))}
          </svg>
        </div>

        <div className="climate-legend">
          <span><span className="sw comfort" />Climate comfort <em style={{ fontStyle: "italic", textTransform: "none", letterSpacing: 0, color: "var(--ink-mute)", fontWeight: 400 }}>(daily highs/lows + rainy days + daylight, normalized 0–10)</em></span>
          {crowd ? <span><span className={`sw crowd${crowdClass}`} />Tourist crowd <em style={{ fontStyle: "italic", textTransform: "none", letterSpacing: 0, color: "var(--ink-mute)", fontWeight: 400 }}>{intensityLabel ? `(${intensityLabel.toLowerCase()} saturation — shape shows the within-city peak)` : "(seasonal shape, within-city scaled)"}</em></span> : null}
          <span><span className="sw visit" />Visit score <em style={{ fontStyle: "italic", textTransform: "none", letterSpacing: 0, color: "var(--ink-mute)", fontWeight: 400 }}>(comfort minus a fraction of crowd)</em></span>
        </div>

        <Climatology climate={climate} homebase={homebase} />

        <Extremes extremes={view.extremes} homebase={homebase} />

        <div className="climate-foot">
          {vw?.charm ? <span><strong>Charm visit</strong> · {MONTH_LONG[vw.charm.idx]} — comfortable weather, after the crowds thin.</span> : null}
          {vw?.truth ? <span><strong>Off-season visit</strong> · {MONTH_LONG[vw.truth.idx]} — coldest and quietest month; the test of whether public life persists off-season.</span> : null}
        </div>
      </div>
    </section>
  );
}

// Build an area path under the series (baseline at y=280). Null months break
// the band — we just skip them, keeping the polygon simple.
function areaPath(series, y) {
  const pts = series.map((v, i) => (v == null ? null : [X(i), y(v)])).filter(Boolean);
  if (!pts.length) return "";
  let d = `M ${pts[0][0]},280 `;
  for (const [px, py] of pts) d += `L ${px},${py} `;
  d += `L ${pts[pts.length - 1][0]},280 Z`;
  return d;
}
function linePath(series, y) {
  const pts = series.map((v, i) => (v == null ? null : [X(i), y(v)])).filter(Boolean);
  if (!pts.length) return "";
  return "M " + pts.map(([px, py]) => `${px},${py}`).join(" L ");
}
function dots(series, y, cls, nowIdx) {
  return series.map((v, i) => v == null ? null : (
    <circle key={i} className={`month-dot ${cls}`} cx={X(i)} cy={y(v)} r={i === nowIdx ? 4.2 : 3.2} />
  ));
}
// Numeric labels above (or below) each dot, so the chart isn't just shape.
// dy < 0 → above the dot, > 0 → below.
function valueLabels(series, y, cls, dy, fmt) {
  return series.map((v, i) => v == null ? null : (
    <text key={i} className={cls} x={X(i)} y={y(v) + dy}>{fmt(v)}</text>
  ));
}
function Annotation({ idx, y, cls, label, sub }) {
  return (
    <>
      <line className="annot-line" x1={X(idx)} y1={y} x2={X(idx)} y2="44" />
      <g transform={`translate(${X(idx)}, 16)`}>
        <text className={`annot-label ${cls}`} textAnchor="middle">{label}</text>
      </g>
      <text x={X(idx)} y="36" className="annot-sub" textAnchor="middle">{sub}</text>
    </>
  );
}

// ---- Climate heatmap (replaces the old bar+delta SVG) ---------------------
//
// One colored cell per month per metric. Color encodes value on a single
// scale that's consistent across every city, so the user can flip between
// detail pages and compare at a glance without re-reading the scale.
//
// Temperature uses a diverging ramp centered on 74°F — the same outdoor-ideal
// pivot monthComfort() penalizes around — so the legend matches the math
// driving Charm/Truth window selection. Precipitation is sequential: 0″ pale
// paper → 8″+ deep blue. City reference anchors on each legend (Minneapolis
// Jan, Phoenix Jul, Miami Sep) let the user calibrate without reading numbers.
const TEMP_STOPS = [
  { t:  -5, c: [22, 35, 70] },
  { t:  20, c: [40, 70, 122] },
  { t:  35, c: [78, 122, 168] },
  { t:  52, c: [130, 175, 200] },
  { t:  66, c: [196, 220, 210] },
  { t:  74, c: [231, 228, 195] },   // pivot — sweet spot, pale warm cream
  { t:  82, c: [232, 196, 130] },
  { t:  92, c: [216, 138,  78] },
  { t: 100, c: [186,  72,  50] },
  { t: 112, c: [128,  30,  30] },
];
const PRECIP_STOPS = [
  { t: 0, c: [248, 244, 230] },
  { t: 1, c: [220, 212, 188] },
  { t: 3, c: [170, 178, 178] },
  { t: 5, c: [110, 130, 156] },
  { t: 8, c: [ 50,  76, 124] },
];
const TEMP_REFS = [
  { v: 22,  name: "Minneapolis Jan" },
  { v: 74,  name: "Outdoor ideal", cls: "now" },
  // `secondary` refs hide on phones, where the three warm-end anchors collide;
  // Minneapolis (cold) / Outdoor ideal / Phoenix (hot) still bracket the scale.
  { v: 89,  name: "Atlanta Jul", secondary: true },
  { v: 106, name: "Phoenix Jul" },
];
const PRECIP_REFS = [
  { v: 0.4, name: "Phoenix Jul" },
  { v: 3.0, name: "Typical US Jul" },
  { v: 7.5, name: "Miami Sep" },
];
function rampColor(v, stops) {
  if (v == null) return [240, 235, 220];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (v >= a.t && v <= b.t) {
      const k = (v - a.t) / (b.t - a.t);
      return a.c.map((ca, j) => Math.round(ca + (b.c[j] - ca) * k));
    }
  }
  return v < stops[0].t ? stops[0].c : stops[stops.length - 1].c;
}
const tempColor = (v) => rampColor(v, TEMP_STOPS);
const precipColor = (v) => rampColor(v, PRECIP_STOPS);
function needsLightText([r, g, b]) {
  const norm = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return (0.2126 * norm[0] + 0.7152 * norm[1] + 0.0722 * norm[2]) < 0.45;
}
const rgbStr = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
const tempPct = (v) => {
  const min = TEMP_STOPS[0].t, max = TEMP_STOPS[TEMP_STOPS.length - 1].t;
  return Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
};
const precipPct = (v) => {
  const max = PRECIP_STOPS[PRECIP_STOPS.length - 1].t;
  return Math.max(0, Math.min(100, (v / max) * 100));
};

function Climatology({ climate }) {
  // "Feels" earns its own row when the felt high (heat index OR wind chill)
  // diverges from the air-temp high by ≥3°F somewhere in the year. Hot/humid
  // cities qualify in summer; cold/windy cities qualify in winter. Mild-air
  // cities skip the row so it doesn't echo High.
  const hasFeel = Array.isArray(climate) && climate.some(
    (m) => m?.feltHigh != null && m.hi != null && Math.abs(m.feltHigh - m.hi) >= 3
  );
  const tempRows = [
    ...(hasFeel ? [{ key: "feel", label: "Feels", pick: (m) => m?.feltHigh, dimmed: false }] : []),
    { key: "high", label: "High", pick: (m) => m?.hi, dimmed: true },
    { key: "low",  label: "Low",  pick: (m) => m?.lo, dimmed: true },
  ];
  return (
    <div className="climate-heatmap" aria-label="Monthly climate normals — felt high, dry-air high, low, precipitation">
      {/* Month header row */}
      <div className="ch-corner" />
      {MONTHS.map((mo) => <div key={`hdr-${mo}`} className="ch-month">{mo}</div>)}

      {/* Temperature data rows */}
      {tempRows.map((row) => (
        <Fragment key={row.key}>
          <div className="ch-label">{row.label}</div>
          {climate.map((m, i) => {
            const v = row.pick(m);
            if (v == null) {
              return <div key={i} className="ch-cell ch-empty" aria-hidden="true" />;
            }
            const c = tempColor(v);
            return (
              <div
                key={i}
                className={"ch-cell" + (row.dimmed ? " dim" : "") + (needsLightText(c) ? " light-text" : "")}
                style={{ background: rgbStr(c) }}
              >
                {Math.round(v)}
              </div>
            );
          })}
        </Fragment>
      ))}

      {/* Temp legend, inline directly under the temperature rows */}
      <Legend
        kind="temp"
        label="Temp °F"
        extremes={["frigid", "brutal heat"]}
        refs={TEMP_REFS}
        pct={tempPct}
        fmtVal={(v) => `${Math.round(v)}°`}
      />

      {/* Precip row */}
      <div className="ch-label">Precip</div>
      {climate.map((m, i) => {
        const v = m?.precipIn;
        if (v == null) return <div key={i} className="ch-cell ch-empty" aria-hidden="true" />;
        const c = precipColor(v);
        return (
          <div
            key={i}
            className={"ch-cell" + (needsLightText(c) ? " light-text" : "")}
            style={{ background: rgbStr(c) }}
          >
            {v.toFixed(1).replace(/\.0$/, "")}
          </div>
        );
      })}

      {/* Precip legend, inline directly under the precip row */}
      <Legend
        kind="precip"
        label="Precip ″"
        extremes={["dry", "tropical wet"]}
        refs={PRECIP_REFS}
        pct={precipPct}
        fmtVal={(v) => `${v.toFixed(1).replace(/\.0$/, "")}″`}
      />
    </div>
  );
}

function Legend({ kind, label, extremes, refs, pct, fmtVal }) {
  return (
    <div className={`ch-legend ch-legend-${kind}`}>
      <div className="ch-legend-label">{label}</div>
      <div className={`ch-ramp ch-ramp-${kind}`}>
        <span className="ch-tick ch-extreme ch-above ch-extreme-left" style={{ left: "0%" }}>{extremes[0]}</span>
        <span className="ch-tick ch-extreme ch-above ch-extreme-right" style={{ left: "100%" }}>{extremes[1]}</span>
        {refs.map((r) => (
          <span
            key={r.v}
            className={`ch-tick ${r.cls === "now" ? "ch-now" : "ch-ref"}${r.secondary ? " ch-ref-secondary" : ""}`}
            style={{ left: `${pct(r.v)}%` }}
          >
            <span className="ch-tick-name">{r.name}</span>
            <span className="ch-tick-val">{fmtVal(r.v)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Extremes({ extremes, homebase }) {
  if (!extremes) return null;
  const ref = homebase?.extremes;
  const cards = [
    { key: "cold", label: "Coldest", ext: extremes.coldest, refExt: ref?.coldest, main: (v) => `${Math.round(v)}°F`, unit: "avg low", fmtRef: (v) => `${Math.round(v)}°F` },
    { key: "hot",  label: "Hottest", ext: extremes.hottest, refExt: ref?.hottest, main: (v) => `${Math.round(v)}°F`, unit: "avg high", fmtRef: (v) => `${Math.round(v)}°F` },
    { key: "wet",  label: "Wettest", ext: extremes.wettest, refExt: ref?.wettest, main: (v) => `${v.toFixed(1)}″`, unit: "precip", fmtRef: (v) => `${v.toFixed(1)}″` },
    { key: "dark", label: "Darkest", ext: extremes.darkest, refExt: ref?.darkest, main: (v) => v.toFixed(1), unit: "daylight hr", fmtRef: (v) => `${v.toFixed(1)} hr` },
  ];
  return (
    <div className="extremes" aria-label="Worst month in each climate direction">
      {cards.map((c) => c.ext ? (
        <article className={`extreme ${c.key}`} key={c.key}>
          <p className="extreme-label">{c.label}</p>
          <p className="extreme-month">{MONTH_LONG[c.ext.monthIdx]}</p>
          <p className="extreme-value">{c.main(c.ext.value)}<small>{c.unit}</small></p>
          {c.refExt && homebase ? <p className="extreme-ref">{homebase.name} · <strong>{c.fmtRef(c.refExt.value)}</strong></p> : null}
        </article>
      ) : null)}
    </div>
  );
}
