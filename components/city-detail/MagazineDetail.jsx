"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { buildCityDetailView, buildHomebaseView } from "../../lib/city-detail-view";
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

const HOMEBASE_SLUG = "allison-park-pa";

// Chapter-based, magazine-format city detail. Renders the same six chapters as
// public/city-detail-redesign.html, fed in-process from the planner's cityItem
// via buildCityDetailView() — the same envelope /api/mockup-data serves, so the
// two never drift. Wrapped in .cd-root (app/city-detail.css) so the editorial
// palette never leaks into the rest of the app.
export default function MagazineDetail({ cityItem }) {
  const { planner, imageState } = usePlanner();

  const view = useMemo(() => buildCityDetailView(cityItem, { slug: citySlug(cityItem) }), [cityItem]);
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
        <img src={appendBust(heroSrc, imageState.version)} alt={`${cityItem.name} at its best`} />
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
          <h2>Where you'd live</h2>
          <p className="note">The stay zone is the broader walkable area; the green field is the best 700 m within it — where the measurements are actually taken.</p>
        </div>
        <div className="where-map-wrap">
          <WhereMap lat={cityItem.lat} lon={cityItem.lon} boundary={cityItem.stayZoneBoundary} />
          <div className="verdict-card" role="group" aria-label="Measured composite score">
            <div className="axis">
              <div className="lab">Measured</div>
              <div className="num">{view.measuredScore != null ? <>{view.measuredScore.toFixed(1)}<small>/10</small></> : "—"}</div>
            </div>
          </div>
          {cityItem.stayZone || cityItem.heartIntersection ? (
            <div className="stay-overlay">
              <p className="eyebrow">Stay zone</p>
              {cityItem.stayZone ? <h3>{cityItem.stayZone}</h3> : null}
              {cityItem.heartIntersection ? <p className="heart">Heart of the zone: <strong>{cityItem.heartIntersection}</strong></p> : null}
            </div>
          ) : null}
        </div>
        <div className="where-foot">
          <span>{cityItem.lat != null ? `Visit center · ${cityItem.lat.toFixed(4)} N, ${Math.abs(cityItem.lon).toFixed(4)} W` : "Visit center not set"}</span>
        </div>
      </section>

      {/* Chapter IV — by the numbers */}
      <ChapterData axes={view.axes} />

      {/* Chapter V — when to go */}
      <ChapterWhen view={view} homebase={homebase} />

      {/* Chapter VI — where to walk */}
      <ChapterWalks cityItem={cityItem} blocks={view.blocks} />
    </div>
  );
}

function ChapterWhy({ view }) {
  const paras = (view.why || "").split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
  if (!paras.length && !view.ifWins && !view.ifFails) {
    return (
      <article id="why" className="why">
        <p className="eyebrow">Why this could be the place</p>
        <p className="why-lead">No editorial written for {view.name} yet — add the case for this place on the detail editor, and it appears here as the lead.</p>
      </article>
    );
  }
  return (
    <article id="why" className="why">
      <p className="eyebrow">Why this could be the place</p>
      {paras.map((p, i) => (
        i === 0 ? <p key={i} className="why-lead">{p}</p> : <p key={i}>{p}</p>
      ))}
      {view.ifWins || view.ifFails ? (
        <div className="gates">
          {view.ifWins ? <p className="gate gate-wins"><span className="gate-label">If it wins —</span> {view.ifWins}</p> : null}
          {view.ifFails ? <p className="gate gate-fails"><span className="gate-label">If it fails —</span> {view.ifFails}</p> : null}
        </div>
      ) : null}
    </article>
  );
}

// Chapter VI — six blocks. The city carries block *names* (no coordinates), so
// each card links to a map search rather than rendering a precise pin — see
// features/six-blocks.md for the coordinate-backed follow-up.
function ChapterWalks({ cityItem, blocks }) {
  if (!blocks?.length) return null;
  return (
    <section id="walks" className="walks" aria-label="Where to walk">
      <div className="walks-head">
        <h2>Six blocks</h2>
        <p className="sub">Worth pacing on a regular Tuesday, in the order a resident would probably do them.</p>
      </div>
      <div className="walks-grid">
        {blocks.map((block, i) => (
          <article className="walk" key={`${block}-${i}`}>
            <div className="walk-map">
              <a
                className="walk-leaflet walk-leaflet-link"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formatMapSearchQuery(cityItem.name, block))}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open map for ${block}`}
              />
              <div className="walk-num">{i + 1}</div>
            </div>
            <h3 className="walk-name">{block}</h3>
            <p className="walk-start"><strong>In</strong> {cityItem.name}</p>
          </article>
        ))}
      </div>
    </section>
  );
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
