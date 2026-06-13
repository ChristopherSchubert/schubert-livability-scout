"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { buildCityDetailView, buildHomebaseView } from "../../lib/city-detail-view";
import { chipFrequencies } from "../../lib/chips";
import { citySlug, formatDriveFromPit, formatMapSearchQuery } from "../../lib/planner-data";
import { appendBust, resolveImage, usePlanner } from "../PlannerProvider";
import FloatingToc from "./FloatingToc";
import ChapterData from "./ChapterData";
import ChapterWhen from "./ChapterWhen";

// The interactive Leaflet map is client-only (Leaflet needs window).
const WhereMap = dynamic(() => import("./WhereMap"), {
  ssr: false,
  loading: () => <div className="leaflet-where" aria-hidden="true" />,
});

// One small read-only Leaflet map per "Six blocks" card. Also client-only.
const BlockMap = dynamic(() => import("./BlockMap"), {
  ssr: false,
  loading: () => null,
});

const HOMEBASE_SLUG = "allison-park-pa";

// Chapter-based, magazine-format city detail. Renders the same six chapters as
// public/city-detail-redesign.html, fed in-process from the planner's cityItem
// via buildCityDetailView() — the same envelope /api/mockup-data serves, so the
// two never drift. Wrapped in .cd-root (app/city-detail.css) so the editorial
// palette never leaks into the rest of the app.
export default function MagazineDetail({ cityItem }) {
  const { planner, imageState } = usePlanner();

  const chipFreq = useMemo(() => chipFrequencies(planner.cities), [planner.cities]);
  const view = useMemo(
    () => buildCityDetailView(cityItem, { slug: citySlug(cityItem), chipFrequencies: chipFreq }),
    [cityItem, chipFreq],
  );
  const homebase = useMemo(() => {
    const hb = planner.cities.find((c) => citySlug(c) === HOMEBASE_SLUG);
    return hb && hb.id !== cityItem.id ? buildHomebaseView(hb, { slug: HOMEBASE_SLUG }) : null;
  }, [planner.cities, cityItem.id]);

  const heroSrc = resolveImage(cityItem.heroImage, cityItem.name, imageState) || placeholder(cityItem.name);
  const driveLabel = formatDriveFromPit(cityItem.driveHrsFromPit);
  const [head, tail] = splitName(cityItem.name);

  return (
    <div className="cd-root">
      <FloatingToc />

      {/* Chapter I — the scene */}
      <section id="scene" className="hero" aria-label={cityItem.name}>
        <img src={appendBust(heroSrc, imageState.version)} alt={`${cityItem.name} at its best`} fetchPriority="high" loading="eager" decoding="async" />
        <div className="hero-grad" />
        <div className="hero-bottom">
          <h1 className="place">{head}{tail ? <>, <em>{tail}</em></> : null}</h1>
          <div className="meta">
            {driveLabel ? <span><strong>{driveLabel.replace(/ drive from PIT| from PIT/, "")}</strong> from PIT</span> : null}
            {driveLabel && view.chips?.length ? <span className="sep" /> : null}
            {view.chips?.length ? <span>{view.chips.join(" · ")}</span> : null}
          </div>
        </div>
      </section>

      {/* Chapter II — the why */}
      <ChapterWhy view={view} />

      {/* Chapter III — where you'd live */}
      <section id="where" className="where" aria-label="Where you'd live">
        <div className="where-head">
          <h2>Stay zone</h2>
          <p className="note">The stay zone is the broader walkable area. The green disk is the plateau (full credit); POIs beyond it contribute less the further out they are, until the 1500 m cutoff.</p>
        </div>
        <div className="where-map-wrap">
          <WhereMap
            lat={cityItem.lat}
            lon={cityItem.lon}
            boundary={cityItem.stayZoneBoundary}
            poiPositions={cityItem.poiPositions}
          />
          <div className="verdict-card" role="group" aria-label="Measured composite score">
            <div className="axis">
              <div className="lab">Measured</div>
              <div className="num">{view.measuredScore != null ? <>{view.measuredScore.toFixed(1)}<small>/10</small></> : "—"}</div>
            </div>
          </div>
          {cityItem.stayZone || cityItem.heartIntersection || hasWalkabilityBreakdown(cityItem) ? (
            <div className="stay-overlay">
              <p className="eyebrow">Stay zone</p>
              {cityItem.stayZone ? <h3>{cityItem.stayZone}</h3> : null}
              {cityItem.heartIntersection ? <p className="heart">Heart of the zone: <strong>{cityItem.heartIntersection}</strong></p> : null}
              <WalkabilityBreakdown cityItem={cityItem} />
            </div>
          ) : null}
        </div>
        <div className="where-foot">
          <span>{cityItem.lat != null ? `Visit center · ${cityItem.lat.toFixed(4)} N, ${Math.abs(cityItem.lon).toFixed(4)} W` : "Visit center not set"}</span>
        </div>
      </section>

      {/* Chapter IV — by the numbers */}
      <ChapterData axes={view.axes} horizonFeatures={view.horizonFeatures} />

      {/* Chapter V — when to go */}
      <ChapterWhen view={view} homebase={homebase} />

      {/* Chapter VI — where to walk */}
      <ChapterWalks cityItem={cityItem} blocks={view.blocks} blockGeometries={view.blockGeometries} blockBlurbs={view.blockBlurbs} />
    </div>
  );
}

// Does this city have any walking-core score measured? If none of the four
// _score envelopes are present we suppress the breakdown — the panel keeps
// just stay_zone + heart_intersection, the same as a city that hasn't been
// re-measured yet.
function hasWalkabilityBreakdown(cityItem) {
  const mm = cityItem.measuredMetrics || {};
  return (
    mm.cafe_score?.value != null ||
    mm.bar_score?.value != null ||
    mm.rest_score?.value != null
  );
}

// "Walkability field" block inside the stay-overlay. Three rows (Cafés /
// Bars & pubs / Restaurants) with the weighted score and a small "N in
// plateau · M beyond" annotation, plus a link to the full-screen walking
// core view. Source: cities.measured_metrics.{cafe,bar,rest}_score, written
// by lib/measurers/walking-core.js. Daily-needs intentionally lives on the
// Realness axis and is not shown here.
function WalkabilityBreakdown({ cityItem }) {
  if (!hasWalkabilityBreakdown(cityItem)) return null;
  const mm = cityItem.measuredMetrics || {};
  const rows = [
    { key: "cafe_score", label: "Cafés" },
    { key: "bar_score",  label: "Bars & pubs" },
    { key: "rest_score", label: "Restaurants" },
  ];
  const slug = citySlug(cityItem);
  return (
    <div className="measure-breakdown" aria-label="Walkability-field breakdown">
      <div className="mb-head">
        <span className="mb-label">Walkability field</span>
        <span className="mb-meta">500 m plateau · 1500 m cutoff</span>
      </div>
      <ul className="mb-rows">
        {rows.map((r) => {
          const env = mm[r.key];
          const meta = env?.meta || {};
          if (env?.value == null) return null;
          return (
            <li key={r.key}>
              <span className="kind">{r.label}</span>
              <span className="raw">
                {meta.in_plateau != null
                  ? `${meta.in_plateau} in plateau · ${meta.beyond ?? 0} beyond`
                  : ""}
              </span>
              <span className="score">{env.value.toFixed(1)}</span>
            </li>
          );
        })}
      </ul>
      {slug ? (
        <a
          className="mb-fullmap"
          href={`/cities/${slug}/walking-core`}
          aria-label="Open the full walking-core map for this city"
        >
          See the full walking-core map
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4 8 V4 H8 M12 4 H16 V8 M16 12 V16 H12 M8 16 H4 V12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </a>
      ) : null}
    </div>
  );
}

function ChapterWhy({ view }) {
  const paras = (view.why || "").split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
  if (!paras.length) {
    return (
      <article id="why" className="why">
        <p className="why-lead">No editorial written for {view.name} yet — add the case for this place on the detail editor, and it appears here as the lead.</p>
      </article>
    );
  }
  return (
    <article id="why" className="why">
      {paras.map((p, i) => (
        i === 0 ? <p key={i} className="why-lead">{p}</p> : <p key={i}>{p}</p>
      ))}
    </article>
  );
}

// Chapter VI — six blocks. Each card embeds a read-only Leaflet mini-map
// (BlockMap) when block_geometries[i] has a confident coord; otherwise
// it falls back to a paper-colored placeholder. The whole .walk-map
// area is overlaid by a transparent link that deep-links to Google
// Maps search for the block.
//
// Confidence rules (see lib/measurers/blocks.js):
//   - exact / between / near / feature / nominatim → render the map
//   - heart-snap / manual → render the map (highest trust)
//   - unresolved (or null lat) → render the placeholder card
// The measurer's integrity gate already rejected anything outside the
// stay-zone polygon, so any non-unresolved entry is safe to render.
function ChapterWalks({ cityItem, blocks, blockGeometries, blockBlurbs }) {
  if (!blocks?.length) return null;
  const geoms = Array.isArray(blockGeometries) ? blockGeometries : [];
  const blurbs = Array.isArray(blockBlurbs) ? blockBlurbs : [];
  return (
    <section id="walks" className="walks" aria-label="Where to walk">
      <div className="walks-head">
        <h2>{capitalize(numberWord(blocks.length))} block{blocks.length === 1 ? "" : "s"}</h2>
        <p className="sub">{capitalize(numberWord(blocks.length))} walk{blocks.length === 1 ? "" : "s"} through the stay zone, ordered as a resident might do them.</p>
      </div>
      <div className="walks-grid">
        {blocks.map((block, i) => {
          const g = geoms[i];
          const showMap = g && g.lat != null && g.lon != null && g.accuracy !== "unresolved";
          const zoom = zoomForAccuracy(g?.accuracy);
          const href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formatMapSearchQuery(cityItem.name, block))}`;
          return (
            <article className="walk" key={`${block}-${i}`}>
              <div className="walk-map">
                {showMap ? (
                  <div className="walk-leaflet">
                    <BlockMap lat={g.lat} lon={g.lon} zoom={zoom} />
                  </div>
                ) : null}
                <a
                  className="walk-leaflet-link"
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open map for ${block}`}
                />
                <div className="walk-num">{i + 1}</div>
              </div>
              <h3 className="walk-name">{block}</h3>
              {blurbs[i] ? <p className="walk-blurb">{blurbs[i]}</p> : <p className="walk-start"><strong>In</strong> {cityItem.name}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// Tighter zoom for high-precision accuracy tiers; wider for landmarks
// and Nominatim fallback hits that are typically less pinpoint.
function zoomForAccuracy(accuracy) {
  switch (accuracy) {
    case "exact":
    case "between":
    case "heart-snap":
    case "manual":
      return 18;
    case "near":
      return 17;
    case "feature":
    case "nominatim":
      return 16;
    default:
      return 17;
  }
}

// Spell out small counts ("six blocks") so the header reads naturally; fall
// back to the digit past twelve. Keeps the section title honest — it reflects
// however many blocks the city actually carries, not a hard-coded "Six".
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six",
  "seven", "eight", "nine", "ten", "eleven", "twelve"];
function numberWord(n) {
  return NUMBER_WORDS[n] ?? String(n);
}
function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function splitName(name) {
  const idx = (name || "").indexOf(",");
  if (idx < 0) return [name, ""];
  return [name.slice(0, idx), name.slice(idx + 1).trim()];
}

function placeholder(label) {
  const text = encodeURIComponent(label || "City");
  return `https://placehold.co/1600x900/1b1814/f6efdf?text=${text}`;
}
