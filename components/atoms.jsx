"use client";

// Display atoms (#21) — the small, reusable pieces the deck's component system
// is built from. One home for the category icon set, the time chip, the
// booking/status badge, the cost tag, and the marker set, so EntryRow, the
// Grid, GatherBucket and BookView all render an entry the same way. Pure
// presentational — no data fetching, no context.
import { MARKER_TYPES } from "../lib/trip";

export const CAT_ICON = { travel: "🚆", meal: "🍴", activity: "🥾", stay: "🛏", errand: "🧾" };
export const CAT_COLOR = { meal: "#9a5a16", activity: "#0d4c44", travel: "#2e5482", stay: "#665285", errand: "#6b6358" };
const STATUS_LABEL = { booked: "booked", reserved: "held", toBook: "to book", none: "" };

// The little glyph for a category. `cat` falls back to a neutral dot.
export function CatIcon({ cat }) {
  return <span className="tw-ico">{CAT_ICON[cat] || "•"}</span>;
}

// A human time string for an entry's time atom (range | point | bucket).
export function entryTimeText(e) {
  const t = e?.time || {};
  if (t.mode === "range" && t.start) return t.end ? `${t.start}–${t.end}` : t.start;
  if (t.mode === "point" && t.at) return t.at;
  return "";
}
export function TimeChip({ entry }) {
  const txt = entryTimeText(entry);
  return <span className="tw-t">{txt}</span>;
}

// The booked / held / to-book pill. Renders nothing for status "none".
export function BookingBadge({ status }) {
  if (!status || status === "none") return null;
  return <span className={`tw-status s-${status}`}>{STATUS_LABEL[status] || status}</span>;
}

// A cost atom: € amount, prefixed 💶 when it's cash-only.
export function CostTag({ cost }) {
  if (!cost || cost.amount == null) return null;
  const sym = cost.currency === "EUR" ? "€" : `${cost.currency || ""} `;
  return <span className="tw-cost">{cost.cashOnly ? "💶 " : ""}{sym}{cost.amount}</span>;
}

// The row of marker glyphs (vegetarian, kid-ok, etc.) carried by an entry.
export function MarkerSet({ markers }) {
  if (!markers?.length) return null;
  return (
    <>
      {markers.map((m, i) => (
        <span key={i} className="tw-marker" title={MARKER_TYPES?.[m.type]?.label || m.type}>
          {MARKER_TYPES?.[m.type]?.icon || "🔖"}
        </span>
      ))}
    </>
  );
}
