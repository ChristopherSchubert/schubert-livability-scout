"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { PLATEAU, D_HALF, MAX_RADIUS } from "../../lib/measurers/walking-core.js";
import "./walking-core.css";

// The Leaflet bits run client-only — dynamic import keeps SSR happy.
const MapInner = dynamic(() => import("./WalkingCoreMap"), { ssr: false });

// Read the ?back= param at mount and resolve a sensible href:
//   1. ?back=/foo on the same origin → use it verbatim
//   2. document.referrer pointing back to this app → use it
//   3. fallback to /cities/[slug] so the chapter is one click away
function useBackHref(slug) {
  const ref = useRef("/cities/" + slug);
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const explicit = p.get("back");
    if (explicit && explicit.startsWith("/")) {
      ref.current = explicit;
      return;
    }
    if (typeof document !== "undefined" && document.referrer && document.referrer.startsWith(location.origin)) {
      try {
        const u = new URL(document.referrer);
        if (u.pathname && u.pathname !== "/walking-core" && !u.pathname.endsWith("/walking-core")) {
          ref.current = u.pathname + u.search;
          return;
        }
      } catch {}
    }
    ref.current = "/cities/" + slug;
  }, [slug]);
  return ref;
}

// Curated subtitle for the city headline overlay. Prefers the curated
// `nearby_feature` region label (#3 — "Adriatic Sea", "Lake Bled"); otherwise
// pulls country / region out of the city name, then falls back to stay_zone.
function cityHeadlineSub(cityItem) {
  if (cityItem.nearbyFeature) return cityItem.nearbyFeature;
  const name = cityItem.name || "";
  if (name.includes(",")) {
    const region = name.split(",").slice(1).join(",").trim();
    if (region) return region;
  }
  return cityItem.stayZone || "Walking core";
}

export default function WalkingCoreView({ cityItem, slug }) {
  const backHrefRef = useBackHref(slug);

  // Walkability score breakdown — same shape as the chapter panel, but the
  // headline numbers are bigger and we include daily_needs as a fourth row.
  const mm = cityItem.measuredMetrics || {};
  const rows = [
    { key: "cafe_score",        label: "Cafés" },
    { key: "bar_score",         label: "Bars & pubs" },
    { key: "rest_score",        label: "Restaurants" },
    { key: "daily_needs_score", label: "Daily needs" },
  ];

  const hasAnyScore = rows.some((r) => mm[r.key]?.value != null);

  return (
    <div className="wc-root">
      <Link className="wc-back" href={backHrefRef.current}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M12 5 L6 10 L12 15 M6 10 H16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to {cityItem.name}
      </Link>

      <div className="wc-headline" aria-live="polite">
        <span className="wc-headline-name">{cityItem.name}</span>
        <span className="wc-headline-sub">{cityHeadlineSub(cityItem)}</span>
      </div>

      <MapInner cityItem={cityItem} />

      <aside className="wc-panel" aria-label="Walking core measurement">
        <p className="wc-eyebrow">The measurement field</p>
        <h3 className="wc-title">Walking core</h3>
        <p className="wc-sub">
          A soft-edged catchment around the densest social cluster.
          Everything inside the plateau counts equally; beyond it, distance
          gently fades the credit until the outer cutoff.
        </p>

        <p className="wc-section-label">Parameters</p>
        <dl className="wc-specs">
          <dt>Plateau <span className="wc-lbl-sub">full credit</span></dt>
          <dd>{PLATEAU} m</dd>
          <dt>d<sub>half</sub> <span className="wc-lbl-sub">decay constant</span></dt>
          <dd>{D_HALF} m</dd>
          <dt>Outer cutoff <span className="wc-lbl-sub">zero credit</span></dt>
          <dd>{MAX_RADIUS} m</dd>
        </dl>

        <p className="wc-section-label">Weight at each shed</p>
        <div className="wc-rings">
          <div className="wc-ring">
            <span className="wc-dot wc-dot-plateau" />
            <span className="wc-r">{PLATEAU} m</span>
            <span className="wc-m">plateau edge</span>
            <span className="wc-w">1.00</span>
          </div>
          <div className="wc-ring">
            <span className="wc-dot wc-dot-800" />
            <span className="wc-r">800 m</span>
            <span className="wc-m">10-min shed</span>
            <span className="wc-w">{weightAt(800).toFixed(2)}</span>
          </div>
          <div className="wc-ring">
            <span className="wc-dot wc-dot-outer" />
            <span className="wc-r">{MAX_RADIUS} m</span>
            <span className="wc-m">outer cutoff</span>
            <span className="wc-w">{weightAt(MAX_RADIUS).toFixed(2)}</span>
          </div>
        </div>

        <p className="wc-formula">
          w(d) = 1 for d ≤ <b>plateau</b><br />
          w(d) = exp(−(d − plateau) / <b>d<sub>half</sub></b>) beyond, until {MAX_RADIUS} m
        </p>

        {hasAnyScore ? (
          <div className="wc-breakdown">
            <div className="wc-bd-head">
              <span className="wc-bd-name">{cityItem.stayZone || cityItem.name}</span>
              <span className="wc-bd-sub">{cityItem.heartIntersection || ""}</span>
            </div>
            <ul>
              {rows.map((r) => {
                const env = mm[r.key];
                if (env?.value == null) return null;
                const meta = env.meta || {};
                return (
                  <li key={r.key}>
                    <span className="wc-bd-kind">{r.label}</span>
                    <span className="wc-bd-raw">
                      {meta.in_plateau != null
                        ? `${meta.in_plateau} in plateau · ${meta.beyond ?? 0} beyond`
                        : ""}
                    </span>
                    <span className="wc-bd-score">{env.value.toFixed(1)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="wc-breakdown">
            <p className="wc-bd-empty">
              Walking-core measurement not yet computed for this city. Run{" "}
              <code>node scripts/measure-cities.mjs --measurer walking_core --slug {slug}</code>{" "}
              to populate.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

function weightAt(d) {
  if (d > MAX_RADIUS) return 0;
  if (d <= PLATEAU) return 1;
  return Math.exp(-(d - PLATEAU) / D_HALF);
}
