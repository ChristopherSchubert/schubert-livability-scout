"use client";

import { useRef, useState } from "react";
import { formatMetricNumber } from "./format";
import HorizonStrip from "./HorizonStrip";

// Chapter IV — By the numbers. Five axis columns, each with its 0–10 rollup and
// its constituent metric rows, rebuilt straight from the snapshot so only real
// taxonomy metrics render and every value carries its cited source (or "—" when
// not yet measured — never a fabricated number).
//
// Desktop renders all five axes side by side (CSS grid). On a phone that grid
// would collapse to ~20 stacked rows — an endless scroll — so the same markup
// becomes a horizontal swipe carousel (one axis per panel, CSS scroll-snap)
// with a tappable chip row + dots for navigation. The switcher/dots are
// display:none on desktop; the carousel CSS only applies at <=640px.
export default function ChapterData({ axes, horizonFeatures }) {
  const list = axes || [];
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);

  function onScroll() {
    const track = trackRef.current;
    if (!track || !track.clientWidth) return;
    const idx = Math.round(track.scrollLeft / track.clientWidth);
    setActive((cur) => (idx !== cur && idx >= 0 && idx < list.length ? idx : cur));
  }

  function goTo(i) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: i * track.clientWidth, behavior: "smooth" });
    setActive(i);
  }

  return (
    <section id="data" className="data" aria-label="By the numbers">
      <div className="data-head">
        <h2>By the numbers</h2>
        <p className="note">
          Cited metrics grouped under five axes. Each bar fills against a fixed threshold —
          an absolute scale, not relative to the other cities.
        </p>
      </div>

      {/* Mobile-only axis switcher: an overview of all five scores that doubles
          as the carousel navigator (tap a chip to jump to that axis). */}
      {list.length > 1 ? (
        <div className="axis-switcher" role="tablist" aria-label="Jump to axis">
          {list.map((axis, i) => (
            <button
              type="button"
              key={axis.axis}
              role="tab"
              aria-selected={i === active}
              className={`axis-chip${i === active ? " active" : ""}`}
              onClick={() => goTo(i)}
            >
              <span className="axis-chip-label">{axis.label}</span>
              <span className="axis-chip-score">{axis.score != null ? axis.score.toFixed(1) : "—"}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="axes" ref={trackRef} onScroll={onScroll}>
        {list.map((axis) => (
          <div className="axis-col" key={axis.axis}>
            <h3>{axis.label}</h3>
            <p className="axis-score">
              {axis.score != null ? <>{axis.score.toFixed(1)}<small>/10</small></> : "—"}
            </p>
            {axis.metrics.map((m) => (
              <MetricRow
                key={m.key}
                m={m}
                addon={
                  m.key === "mtn_horizon_pct" && horizonFeatures ? (
                    <HorizonStrip horizon={horizonFeatures} />
                  ) : null
                }
              />
            ))}
          </div>
        ))}
      </div>

      {/* Mobile-only position dots — the "this swipes" affordance. */}
      {list.length > 1 ? (
        <div className="axis-dots" aria-hidden="true">
          {list.map((axis, i) => (
            <span key={axis.axis} className={`axis-dot${i === active ? " active" : ""}`} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function MetricRow({ m, addon }) {
  return (
    <div className="metric">
      <div className="metric-top">
        <span className="metric-name">{m.label}</span>
        <span className="metric-value">
          {m.value != null ? (
            <>
              {formatMetricNumber(m)}
              {m.unit === "days" ? <small style={{ color: "var(--ink-mute)", fontWeight: 400 }}> / 365</small> : null}
            </>
          ) : "—"}
        </span>
      </div>
      {m.tagline ? <div className="metric-tagline">{m.tagline}</div> : null}
      <div className={m.direction < 0 ? "metric-bar negative" : "metric-bar"}>
        <span style={{ width: m.barPct != null ? `${m.barPct}%` : 0 }} />
      </div>
      {addon}
      {m.source ? <div className="metric-source" title={m.source}>{m.source}</div> : null}
    </div>
  );
}
