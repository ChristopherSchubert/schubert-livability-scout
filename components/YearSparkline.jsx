// YearSparkline — a compact 12-month comfort sparkline for the Compare view.
//
// Pure presentational: it draws the year-shape of a place's visit comfort so
// you can see *when* it's good at a glance, next to the "great in [month]"
// number. The selected month is highlighted; the Prime and Off-season months
// (from cityVisitWindow) get their own ticks, matching the bigger vw-strip on
// the city page so the two never tell different stories.
//
// Props:
//   series        number[12] of 0–10 comfort, or null entries for unmeasured
//                 months; null/short array ⇒ a muted placeholder (never faked).
//   selectedMonth 0–11 — the month the Compare view is sorted/filtered on.
//   primeIdx      0–11 or null — the recommended Prime month.
//   offSeasonIdx  0–11 or null — the Off-season (coldest, quietest) month.
import { MONTHS } from "../lib/planner-data";

export default function YearSparkline({ series, selectedMonth, primeIdx = null, offSeasonIdx = null }) {
  if (!Array.isArray(series) || series.length !== 12) {
    return <span className="rt-spark rt-spark-empty" aria-label="Year-round comfort not measured">—</span>;
  }
  const max = 10; // comfort is already a fixed 0–10 scale; share the axis across rows
  return (
    <span className="rt-spark" role="img" aria-label="Year-round visit comfort by month">
      {series.map((v, i) => {
        const h = v == null ? 0 : Math.max(4, (v / max) * 100); // floor so a real-but-low month is still visible
        const cls = [
          "rt-spark-bar",
          v == null ? "na" : "",
          i === selectedMonth ? "sel" : "",
          i === primeIdx ? "prime" : "",
          i === offSeasonIdx ? "offseason" : "",
        ].filter(Boolean).join(" ");
        const title = v == null ? `${MONTHS[i]}: not measured` : `${MONTHS[i]}: ${v.toFixed(1)}/10`;
        return <span key={i} className={cls} style={{ height: `${h}%` }} title={title} />;
      })}
    </span>
  );
}
