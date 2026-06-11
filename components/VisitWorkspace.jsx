"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  cityImageQuery,
  cityStage,
  citySlug,
  weightedAxisScore,
} from "../lib/planner-data";
import AppShell from "./AppShell";
import { WorkspaceLoading } from "./Loading";
import { resolveImage, usePlanner } from "./PlannerProvider";

// Equal-weight measured composite — same engine as the Detail and Board
// scores. Calibrate applies any learned per-axis weights; here we just want a
// quick "how measured-good is this place" glance.
const EQUAL_WEIGHTS = { setting: 1, aliveness: 1, fabric: 1, realness: 1, january: 1 };

/**
 * VisitWorkspace — purpose-built page for the Visit stage.
 *
 * Not a kanban column. This is a timeline-ish list of trips you've planned
 * or are on, sorted by arrival date. Each row shows the logistics summary
 * you wrote on the City Detail / Visit pages so you can scan trips without
 * opening them.
 */
export default function VisitWorkspace() {
  const { planner, imageState, hydrated } = usePlanner();

  const trips = useMemo(() => {
    return planner.cities
      .filter((cityItem) => cityStage(cityItem) === "planned")
      .map((cityItem) => ({
        cityItem,
        arrive: parseDate(cityItem.arriveDate),
        depart: parseDate(cityItem.departDate),
      }))
      .sort((a, b) => {
        // Trips with concrete arrive dates first, sorted by date ascending.
        if (a.arrive && b.arrive) return a.arrive - b.arrive;
        if (a.arrive) return -1;
        if (b.arrive) return 1;
        return a.cityItem.name.localeCompare(b.cityItem.name);
      });
  }, [planner.cities]);

  return (
    <AppShell activeMode="planned">
      <section className="canvas-header trip-cal-header">
        <div>
          <p className="page-eyebrow">Planned</p>
          <h1>Planned and active trips</h1>
          <p className="canvas-sub">{!hydrated ? "Loading…" : trips.length === 0 ? "Commit a trip's dates in Planning to lock it in here." : `${trips.length} ${trips.length === 1 ? "trip" : "trips"}, sorted by arrival date.`}</p>
        </div>
        <Link className="ghost-link trip-cal-toggle" href="/planning/calendar">Calendar view →</Link>
      </section>

      {!hydrated ? (
        <WorkspaceLoading />
      ) : trips.length === 0 ? (
        <EmptyState
          title="No trips planned"
          body="When you commit a trip's dates in Planning, it appears here, grouped by arrival date with logistics at a glance."
          href="/planning"
          cta="Go to Planning"
        />
      ) : (
        <ol className="trip-list">
          {trips.map(({ cityItem, arrive, depart }) => {
            const slug = citySlug(cityItem);
            const heroQuery = cityImageQuery(cityItem.name, cityItem.stayZone, cityItem.heartIntersection);
            const heroSrc = resolveImage(cityItem.heroImage, heroQuery, imageState);
            const measured = weightedAxisScore(cityItem, EQUAL_WEIGHTS);
            const avg = measured != null ? measured.toFixed(1) : "—";
            const today = new Date();
            const active = arrive && depart && today >= arrive && today <= depart;
            return (
              <li key={cityItem.id} className={`trip-row${active ? " trip-active" : ""}`}>
                <div className="trip-media">
                  {heroSrc ? <img src={heroSrc} alt="" /> : <div className="trip-media-fallback" aria-hidden="true">{cityItem.name.slice(0, 1)}</div>}
                  {active ? <span className="trip-active-pill">On trip</span> : null}
                </div>
                <div className="trip-meta">
                  <header className="trip-row-head">
                    <Link className="trip-name" href={`/cities/${slug}/plan`}>{cityItem.name}</Link>
                    <span className="trip-score">{avg}</span>
                  </header>
                  <p className="trip-dates">{formatDateRange(arrive, depart) || cityItem.tripWeek || "Dates TBD"}</p>
                  <dl className="trip-facts">
                    <Fact label="Stay zone" value={cityItem.stayZone} />
                    <Fact label="Heart" value={cityItem.heartIntersection} />
                    <Fact label="Lodging" value={firstLine(cityItem.lodgingDetails)} />
                    <Fact label="Flight" value={firstLine(cityItem.flightDetails)} />
                  </dl>
                </div>
                <div className="trip-actions">
                  <Link className="button-link" href={`/cities/${slug}/plan`}>Open trip plan</Link>
                  <Link className="ghost-link" href={`/cities/${slug}`}>Detail</Link>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </AppShell>
  );
}

function Fact({ label, value }) {
  if (!value) return null;
  return (
    <div className="trip-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function EmptyState({ title, body, href, cta }) {
  return (
    <section className="workspace-empty">
      <h2>{title}</h2>
      <p>{body}</p>
      {href ? <Link className="button-link" href={href}>{cta}</Link> : null}
    </section>
  );
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateRange(arrive, depart) {
  if (!arrive) return "";
  const fmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
  if (!depart) return fmt.format(arrive);
  const sameMonth = arrive.getMonth() === depart.getMonth() && arrive.getFullYear() === depart.getFullYear();
  if (sameMonth) {
    const monthDay = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
    const dayOnly = new Intl.DateTimeFormat(undefined, { day: "numeric" });
    return `${monthDay.format(arrive)} – ${dayOnly.format(depart)}`;
  }
  return `${fmt.format(arrive)} – ${fmt.format(depart)}`;
}

function firstLine(value) {
  if (!value) return "";
  const line = String(value).split(/\r?\n/).find((part) => part.trim().length);
  return line ? line.trim() : "";
}
