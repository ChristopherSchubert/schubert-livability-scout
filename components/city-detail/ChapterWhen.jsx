// Chapter V — When to go. Everything here is computed from the city's real
// monthly normals (visitClimate) and derived comfort/visit series — never the
// mockup's hand-pinned Newport numbers. When a city has no climate data yet we
// render an honest "pending" stub instead of a fabricated chart.

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
  const crowd = Array.isArray(view.crowdSeason) ? view.crowdSeason : null; // 0–5 | null
  const nowIdx = new Date().getMonth();
  const vw = view.visitWindow;

  // Visit-worth synthesis: comfort minus a fraction of crowd pressure (when we
  // know it). With no crowd data, the verdict line IS the comfort line.
  const visit = comfort.map((c, i) => {
    if (c == null) return null;
    const pen = crowd && Number.isFinite(crowd[i]) ? 0.35 * crowd[i] * 2 : 0;
    return Math.max(0, Math.min(10, c - pen));
  });

  const yC = (v) => 280 - v * 20;          // comfort/visit 0–10 → 200px band
  const yCrowd = (v) => 280 - v * 40;      // crowd 0–5 → 200px band

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
            {crowd ? <path className="crowd-area" fill="url(#crowdGrad)" d={areaPath(crowd, yCrowd)} /> : null}
            <path className="comfort-stroke" d={linePath(comfort, yC)} />
            {crowd ? <path className="crowd-stroke" d={linePath(crowd, yCrowd)} /> : null}
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

            {MONTHS.map((mo, i) => (
              <text key={mo} className={`month-label${i === nowIdx ? " now" : ""}`} x={X(i)} y="296">{mo}</text>
            ))}
          </svg>
        </div>

        <div className="climate-legend">
          <span><span className="sw comfort" />Climate comfort <em style={{ fontStyle: "italic", textTransform: "none", letterSpacing: 0, color: "var(--ink-mute)", fontWeight: 400 }}>(daily highs/lows + rainy days + daylight, normalized 0–10)</em></span>
          {crowd ? <span><span className="sw crowd" />Tourist crowd <em style={{ fontStyle: "italic", textTransform: "none", letterSpacing: 0, color: "var(--ink-mute)", fontWeight: 400 }}>(seasonal occupancy, 0–5)</em></span> : null}
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

// Three small-multiples rows (high / low / precip), each pairing the city's
// month against the home base (Allison Park) when its climate is known.
function Climatology({ climate, homebase }) {
  const ref = Array.isArray(homebase?.visitClimate) && homebase.visitClimate.length === 12 ? homebase.visitClimate : null;
  // "Feels" only earns a row when the heat index diverges from the high by
  // at least 3°F in some month — northern cities sit at or near the air temp
  // year-round, so the row would just echo the High line.
  const hasFeel = Array.isArray(climate) && climate.some((m) => m?.heatIndex != null && m.hi != null && (m.heatIndex - m.hi) >= 3);
  const rows = [
    { key: "high",   label: "High",   pick: (m) => m?.hi,       max: 90, fmt: (v) => String(Math.round(v)) },
    ...(hasFeel ? [{ key: "feel", label: "Feels", pick: (m) => (m?.heatIndex != null && m?.hi != null && (m.heatIndex - m.hi) >= 1) ? m.heatIndex : null, max: 110, fmt: (v) => String(Math.round(v)) }] : []),
    { key: "low",    label: "Low",    pick: (m) => m?.lo,       max: 80, fmt: (v) => String(Math.round(v)) },
    { key: "precip", label: "Precip", pick: (m) => m?.precipIn, max: 7,  fmt: (v) => v.toFixed(1) },
  ];
  const vbH = 200 + rows.length * 90;
  const labelY = vbH - 15;
  return (
    <div className="climatology" aria-label="Monthly normals — daily high, daily low, precipitation">
      <svg viewBox={`0 0 1080 ${vbH}`} preserveAspectRatio="xMinYMid meet" role="img">
        <defs>
          <pattern id="hatch-high" patternUnits="userSpaceOnUse" width="3.5" height="3.5" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="3.5" stroke="#b86a3f" strokeWidth="1.3" /></pattern>
          <pattern id="hatch-feel" patternUnits="userSpaceOnUse" width="3.5" height="3.5" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="3.5" stroke="#a23a30" strokeWidth="1.3" /></pattern>
          <pattern id="hatch-low" patternUnits="userSpaceOnUse" width="3.5" height="3.5" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="3.5" stroke="#4a78a8" strokeWidth="1.3" /></pattern>
          <pattern id="hatch-precip" patternUnits="userSpaceOnUse" width="3.5" height="3.5" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="3.5" stroke="#6e7d8c" strokeWidth="1.3" /></pattern>
        </defs>
        {rows.map((row, r) => (
          <g key={row.key} transform={`translate(0, ${r * 90})`}>
            <text className="row-label" x="0" y="10">{row.label}</text>
            <line className="row-rule" x1="0" y1="16" x2="1080" y2="16" />
            <line className="gridline" x1="60" y1="80" x2="1020" y2="80" />
            {climate.map((m, i) => {
              const v = row.pick(m);
              if (v == null) return null;
              const cx = X(i);
              const h = Math.max(0, (v / row.max) * 28);
              const rv = ref ? row.pick(ref[i]) : null;
              const rh = rv != null ? Math.max(0, (rv / row.max) * 28) : null;
              const delta = rv != null ? v - rv : null;
              return (
                <g key={i}>
                  {delta != null ? (
                    <text className={`delta ${delta > 0 ? "pos" : delta < 0 ? "neg" : "zero"}`} x={cx} y="30">
                      {delta > 0 ? "+" : ""}{row.key === "precip" ? delta.toFixed(1) : Math.round(delta)}
                    </text>
                  ) : null}
                  <text className="val" x={cx} y="48">{row.fmt(v)}</text>
                  <rect className={`bar ${row.key}`} x={cx - 14} y={80 - h} width="12" height={h} />
                  {rh != null ? <rect className={`bar ref ${row.key}`} x={cx + 2} y={80 - rh} width="12" height={rh} /> : null}
                </g>
              );
            })}
          </g>
        ))}
        <g transform={`translate(0, ${labelY})`}>
          {MONTHS.map((mo, i) => <text key={mo} className="month-label" x={X(i)} y="0">{mo}</text>)}
        </g>
      </svg>
      <p className="climatology-caption">
        High/Low{hasFeel ? " / Feels-like (heat index)" : ""} in °F · Precip in inches
        {ref ? <> · <span className="ref-swatch" aria-hidden="true" /> hatched bars show the same months in <strong style={{ color: "var(--ink)", fontWeight: 600 }}>{homebase.name}</strong> (your home base) for comparison.</> : null}
      </p>
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
