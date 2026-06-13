"use client";

// TripMapInner — the day/trip map (#30, #8). Placed stops (meal | activity with
// real lat/lon) rendered as numbered pins, grouped by leg, with one polyline per
// leg so intra-city routes are readable. An honest caption counts how many stops
// are placeable but not yet pinned — never silently drops them. A leg-focus
// control lets you zoom into a single city.
//
// Loaded via dynamic({ ssr:false }) — react-leaflet is client-only.
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useMemo, useEffect, useState } from "react";
import { tripDays, entriesByDay } from "../lib/trip";
import { placeableStops } from "../lib/trip-frame";
import { CAT_COLOR } from "./atoms";

// Matches TripWindow.jsx — the canonical palette for leg identity.
const LEG_COLORS = ["#0d4c44", "#2e5482", "#9a5a16", "#665285", "#6b6358"];

// FitBounds — fits or re-fits the map to a set of [lat, lon] points. Keyed on
// content so re-renders caused by parent state don't snap the view back (#57).
function FitBounds({ points, trigger }) {
  const map = useMap();
  useEffect(() => {
    const num = points
      .map((p) => [Number(p[0]), Number(p[1])])
      .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (!num.length) return;
    // Defer one frame so the container has its final size (the panel/tab
    // mounts around us) — otherwise fitBounds reads a 0-size box and snaps to
    // street zoom. maxZoom caps a tight single-city cluster from over-zooming.
    const id = setTimeout(() => {
      map.invalidateSize();
      const lats = num.map((p) => p[0]), lons = num.map((p) => p[1]);
      const span = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lons) - Math.min(...lons));
      const center = [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lons) + Math.max(...lons)) / 2];
      // A near-identical cluster (e.g. one city's stops at the same pin) yields a
      // degenerate bounds — fitBounds would snap to street zoom (18). Center it
      // at city zoom instead. Otherwise fit, capped so it never over-zooms.
      if (span < 0.02) map.setView(center, 13);
      else map.fitBounds(num, { padding: [40, 40], maxZoom: 13 });
    }, 80);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, map]);
  return null;
}

export default function TripMapInner({ trip }) {
  const [focusLeg, setFocusLeg] = useState(null); // null = all legs

  // Build placed stops in day→time order, annotated with their leg index.
  const { placed, placeableCount, unpinnedCount, legGroups } = useMemo(() => {
    const days = tripDays(trip);
    const byDay = entriesByDay(trip);
    const legs = trip.legs || [];

    // Map each leg to its color index for stable identity.
    const legIndexFor = (dateStr) =>
      legs.findIndex((l) => l.arrive <= dateStr && dateStr <= l.depart);

    const { placed, placeableCount, unpinnedCount } = placeableStops(trip);

    // Re-sort placed into trip order (day asc, then time within day) and annotate
    // each entry with legIndex and legName for grouping.
    const orderedPlaced = [];
    for (const d of days) {
      for (const e of byDay[d.date] || []) {
        if (e.place && e.place.lat != null && e.place.lon != null &&
            (e.category === "meal" || e.category === "activity")) {
          const li = legIndexFor(d.date);
          const legName = legs[li]?.name?.split(",")[0].trim() || `Leg ${li + 1}`;
          orderedPlaced.push({ ...e, _legIndex: li < 0 ? 0 : li, _legName: legName });
        }
      }
    }

    // Group into per-leg arrays for polylines + the leg-focus control.
    const groupsMap = new Map();
    for (const e of orderedPlaced) {
      const li = e._legIndex;
      if (!groupsMap.has(li)) groupsMap.set(li, { legIndex: li, legName: e._legName, entries: [] });
      groupsMap.get(li).entries.push(e);
    }
    const legGroups = [...groupsMap.values()].sort((a, b) => a.legIndex - b.legIndex);

    return { placed: orderedPlaced, placeableCount, unpinnedCount, legGroups };
  }, [trip]);

  // Which entries to show depends on focusLeg.
  const visibleEntries = focusLeg == null
    ? placed
    : placed.filter((e) => e._legIndex === focusLeg);

  // jsonb stores place.lat/lon as strings — coerce to numbers or Leaflet's
  // bounds math degenerates (a string-coord bounds zooms to street level).
  const allPoints = visibleEntries.map((e) => [Number(e.place.lat), Number(e.place.lon)]);

  // A sane initial center/zoom independent of fitBounds timing: the centroid of
  // all points, and a zoom from the lat/lon span (a multi-city trip → regional,
  // a single cluster → city). FitBounds then refines once the box has size.
  const initView = (() => {
    if (!allPoints.length) return { center: [46.05, 14.5], zoom: 7 };
    const lats = allPoints.map((p) => p[0]), lons = allPoints.map((p) => p[1]);
    const center = [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lons) + Math.max(...lons)) / 2];
    const span = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lons) - Math.min(...lons));
    const zoom = span > 1 ? 8 : span > 0.3 ? 9 : span > 0.08 ? 11 : 13;
    return { center, zoom };
  })();

  // A stable string key so FitBounds only fires when focus or placed-set changes.
  const fitKey = `${focusLeg ?? "all"}|${allPoints.map((p) => p.join(",")).join("|")}`;

  if (!placed.length && placeableCount === 0) {
    return (
      <div className="tg-stub" style={{ padding: "2rem" }}>
        No stops yet — add meal or activity entries and resolve their places (🔍 picker, or Gather) to map them.
      </div>
    );
  }

  if (!placed.length) {
    // There are placeable stops but none are pinned yet.
    return (
      <div className="tg-stub" style={{ padding: "2rem" }}>
        {placeableCount} stop{placeableCount > 1 ? "s aren't" : " isn't"} pinned to a place yet — resolve places (🔍 picker, or Gather) to map them.
      </div>
    );
  }

  return (
    <div className="tm-wrap">
      {/* Honest caption — only shown when some placeable stops aren't mapped */}
      {unpinnedCount > 0 && (
        <p className="tm-caption" role="status">
          Showing {placed.length} of {placeableCount} stop{placeableCount > 1 ? "s" : ""} —{" "}
          {unpinnedCount} {unpinnedCount > 1 ? "aren't" : "isn't"} pinned to a place yet.
        </p>
      )}

      {/* Leg-focus control */}
      {legGroups.length > 1 && (
        <div className="tm-legs" role="group" aria-label="Focus map on a leg">
          <button
            className={`tm-leg-btn${focusLeg == null ? " active" : ""}`}
            onClick={() => setFocusLeg(null)}
          >All</button>
          {legGroups.map((g) => (
            <button
              key={g.legIndex}
              className={`tm-leg-btn${focusLeg === g.legIndex ? " active" : ""}`}
              style={{ "--leg-color": LEG_COLORS[g.legIndex % LEG_COLORS.length] }}
              onClick={() => setFocusLeg(focusLeg === g.legIndex ? null : g.legIndex)}
            >{g.legName}</button>
          ))}
        </div>
      )}

      {/* SR-only list of placed stops — Leaflet pins aren't exposed to a11y (#38) */}
      <ol className="sr-only" aria-label="Placed stops in order">
        {visibleEntries.map((e, i) => (
          <li key={e.id}>{i + 1}. {e.title}{e.day ? ` — ${e.day}` : ""}{e.place?.name ? ` — ${e.place.name}` : ""}</li>
        ))}
      </ol>

      <MapContainer
        center={initView.center}
        zoom={initView.zoom}
        scrollWheelZoom
        aria-label="Map of placed trip stops"
        style={{ height: 540, width: "100%", borderRadius: 10 }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap &copy; CARTO"
        />
        <FitBounds points={allPoints} trigger={fitKey} />

        {/* Per-leg polylines — each leg gets its own color segment */}
        {legGroups
          .filter((g) => focusLeg == null || g.legIndex === focusLeg)
          .map((g) => {
            const pts = g.entries.map((e) => [Number(e.place.lat), Number(e.place.lon)]);
            if (pts.length < 2) return null;
            return (
              <Polyline
                key={`leg-${g.legIndex}`}
                positions={pts}
                pathOptions={{
                  color: LEG_COLORS[g.legIndex % LEG_COLORS.length],
                  weight: 2,
                  opacity: 0.45,
                  dashArray: "4 6",
                }}
              />
            );
          })}

        {/* Numbered pins, colored by category, outlined by leg color */}
        {visibleEntries.map((e, i) => (
          <CircleMarker
            key={e.id}
            center={[Number(e.place.lat), Number(e.place.lon)]}
            radius={9}
            pathOptions={{
              color: LEG_COLORS[e._legIndex % LEG_COLORS.length],
              weight: 2,
              fillColor: CAT_COLOR[e.category] || "#6b6358",
              fillOpacity: 1,
            }}
          >
            <Tooltip>{`${i + 1}. ${e.title}`}{e.day ? ` · ${e.day.slice(5)}` : ""}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
