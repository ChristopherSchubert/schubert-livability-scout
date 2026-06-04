import { formatMetricNumber } from "./format";
import HorizonStrip from "./HorizonStrip";

// Chapter IV — By the numbers. Five axis columns, each with its 0–10 rollup and
// its constituent metric rows, rebuilt straight from the snapshot so only real
// taxonomy metrics render and every value carries its cited source (or "—" when
// not yet measured — never a fabricated number).
export default function ChapterData({ axes, horizonFeatures }) {
  return (
    <section id="data" className="data" aria-label="By the numbers">
      <div className="data-head">
        <h2>By the numbers</h2>
        <p className="note">
          Cited metrics grouped under five axes. Each bar fills against a fixed threshold —
          an absolute scale, not relative to the other cities.
        </p>
      </div>

      {horizonFeatures?.peaks?.length ? <HorizonStrip horizon={horizonFeatures} /> : null}

      <div className="axes">
        {(axes || []).map((axis) => (
          <div className="axis-col" key={axis.axis}>
            <h3>{axis.label}</h3>
            <p className="axis-score">
              {axis.score != null ? <>{axis.score.toFixed(1)}<small>/10</small></> : "—"}
            </p>
            {axis.metrics.map((m) => (
              <MetricRow key={m.key} m={m} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricRow({ m }) {
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
      {m.source ? <div className="metric-source">{m.source}</div> : null}
    </div>
  );
}
