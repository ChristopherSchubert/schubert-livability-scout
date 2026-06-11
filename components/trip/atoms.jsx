"use client";

// Trip display atoms (issue #21) — presentational, render from props, no
// Supabase. MarkerSet / TimeChip / BookingBadge / PlaceRef / EntryCard.
// Color is never the sole signal (WCAG 1.4.1): every kind + marker carries text.
// Spec: features/trip-planner-components.md §4.1–4.4.

import { MARKER_TYPES } from "../../lib/trip";

// ── TimeChip — point | range | fuzzy(bucket) ────────────────────────────────
function fmt(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}
const BUCKET_LABEL = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };

export function TimeChip({ time, tzLabel }) {
  if (!time) return null;
  let text;
  let aria;
  if (typeof time === "string") {
    text = fmt(time);
    aria = text;
  } else if (time.mode === "range") {
    text = `${fmt(time.start)}–${fmt(time.end)}`;
    aria = `from ${fmt(time.start)} to ${fmt(time.end)}`;
  } else if (time.mode === "bucket") {
    text = BUCKET_LABEL[time.bucket] || time.bucket || "";
    aria = text;
  } else {
    text = fmt(time.at || time.start);
    aria = text;
  }
  if (!text) return null;
  return (
    <span className="time-chip" aria-label={tzLabel ? `${aria}, ${tzLabel}` : aria}>
      🕘 {text}
      {tzLabel ? <em> · {tzLabel}</em> : null}
    </span>
  );
}

// ── BookingBadge — status + confirmation/cancel-by ──────────────────────────
const STATUS_LABEL = { none: "", toBook: "To book", reserved: "Reserved", booked: "Booked" };

export function BookingBadge({ status, booking }) {
  const label = STATUS_LABEL[status];
  if (!label && !booking?.confirmation) return null;
  return (
    <span className="booking-badge" data-status={status}>
      {status === "booked" ? "🔒 " : status === "reserved" ? "📞 " : ""}
      {label}
      {/* never truncate a confirmation code */}
      {booking?.confirmation ? <code> {booking.confirmation}</code> : null}
      {booking?.cancelBy ? <em> · cancel by {booking.cancelBy}</em> : null}
    </span>
  );
}

// ── MarkerSet — the signature element. Icon + label always (no color-only). ──
export function MarkerSet({ markers = [], showSources = false }) {
  if (!markers.length) return null;
  return (
    <span className="marker-set">
      {markers.map((m, i) => {
        const def = MARKER_TYPES[m.type] || {};
        return (
          <span
            key={`${m.type}-${i}`}
            className={`marker-chip${m.source ? "" : " marker-uncited"}`}
            data-attr={m.type}
            title={m.source || "unverified"}
          >
            <span aria-hidden="true">{def.icon || "•"}</span>
            <span>{def.label || m.type}</span>
            {m.value ? <em> {m.value}</em> : null}
            {showSources && m.source ? <small> — {m.source}</small> : null}
          </span>
        );
      })}
    </span>
  );
}

// ── PlaceRef — name + directions ────────────────────────────────────────────
export function PlaceRef({ place }) {
  if (!place?.name && !place?.placeId) return null;
  const q = place.placeId
    ? `https://www.google.com/maps/place/?q=place_id:${place.placeId}`
    : place.lat != null
      ? `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}`
      : null;
  return (
    <span className="place-ref">
      📍{" "}
      {q ? (
        <a
          href={q}
          target="_blank"
          rel="noreferrer"
          aria-label={`Directions to ${place.name || "place"}`}
        >
          {place.name || "Map"}
        </a>
      ) : (
        place.name
      )}
      {place.address ? <small> · {place.address}</small> : null}
    </span>
  );
}

// ── EntryCard — the atom, compact (grid) | full (agenda) ────────────────────
export function EntryCard({ entry, density = "full", tzLabel, onClick }) {
  const cat = entry.category || "activity";
  const spine = `var(--kind-${cat}, var(--muted))`;
  const fill = `var(--kind-${cat}-fill, transparent)`;
  return (
    <article
      className="entry-card"
      data-density={density}
      data-category={cat}
      style={{ "--spine": spine, "--fill": fill }}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick(e);
        }
      }}
      aria-label={[entry.title, cat, entry.status, entry.cost?.cashOnly ? "cash only" : null]
        .filter(Boolean)
        .join(", ")}
    >
      <div className="entry-card-title">
        {entry.title || "Untitled"} <small style={{ color: spine }}>· {cat}</small>
      </div>
      <div className="entry-card-meta">
        <TimeChip time={entry.time} tzLabel={tzLabel} />
        <BookingBadge status={entry.status} booking={entry.booking} />
      </div>
      {density === "full" ? (
        <>
          {entry.note ? <p className="entry-card-note">{entry.note}</p> : null}
          <PlaceRef place={entry.place} />
          <MarkerSet markers={entry.markers} />
        </>
      ) : null}
    </article>
  );
}
