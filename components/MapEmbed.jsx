"use client";

import { googleMapsSearchUrl } from "../lib/planner-data";

/**
 * MapEmbed — loads the Google Maps embed by default. (The preview tool warns
 * on cross-origin iframes, but the deployed/real-browser experience is to see
 * the map immediately, so we auto-load.)
 */
export default function MapEmbed({ query, zoom = 14, title, className }) {
  const wrapperClass = `map-frame ${className || ""}`.trim();
  const src = `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=${zoom}&output=embed`;
  return (
    <div className={wrapperClass}>
      <iframe title={title || "Map"} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={src} />
      <a className="map-frame-open" href={googleMapsSearchUrl(query)} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
    </div>
  );
}
