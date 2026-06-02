"use client";

import { googleMapsSearchUrl } from "../lib/planner-data";

/**
 * MapEmbed — auto-loads the Google Maps embed in production (the real
 * deployed experience). In local dev it renders a placeholder + link instead,
 * because the Claude Preview sandbox blocks cross-origin iframes and would
 * otherwise spam "preview only supports localhost URLs" warnings on every map.
 */
export default function MapEmbed({ query, zoom = 14, title, className }) {
  const wrapperClass = `map-frame ${className || ""}`.trim();
  const openHref = googleMapsSearchUrl(query);

  if (process.env.NODE_ENV !== "production") {
    return (
      <div className={`${wrapperClass} map-embed-placeholder`}>
        <span className="map-embed-placeholder-title">{title || "Map"}</span>
        <span className="map-embed-placeholder-query">{query}</span>
        <a className="button-link" href={openHref} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
        <span className="map-embed-note">(live map renders on the deployed site)</span>
      </div>
    );
  }

  const src = `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=${zoom}&output=embed`;
  return (
    <div className={wrapperClass}>
      <iframe title={title || "Map"} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={src} />
      <a className="map-frame-open" href={openHref} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
    </div>
  );
}
