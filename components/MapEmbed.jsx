"use client";

import { useState } from "react";
import { googleMapsSearchUrl } from "../lib/planner-data";

/**
 * MapEmbed — click-to-load map slot.
 *
 * Renders a placeholder card by default with two actions: "Load map" (swaps
 * in the Google Maps iframe inline) and "Open in Google Maps" (new tab).
 * Nothing auto-loads, so preview tools that block cross-origin iframe loads
 * (Claude Preview, etc.) won't pop up warnings every time the page renders.
 *
 * For City Detail, which has stay-zone + city + per-zone maps, this turns
 * 6+ auto-loaded iframes into zero — only the maps you actually want to
 * see load when you ask for them.
 */
export default function MapEmbed({ query, zoom = 14, title, className }) {
  const [loaded, setLoaded] = useState(false);
  const wrapperClass = `map-frame ${className || ""}`.trim();

  if (loaded) {
    const src = `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=${zoom}&output=embed`;
    return (
      <div className={wrapperClass}>
        <iframe title={title || "Map"} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={src} />
      </div>
    );
  }

  const openHref = googleMapsSearchUrl(query);
  return (
    <div className={`${wrapperClass} map-embed-placeholder`}>
      <span className="map-embed-placeholder-title">{title || "Map"}</span>
      <span className="map-embed-placeholder-query">{query}</span>
      <div className="map-embed-placeholder-actions">
        <button type="button" className="button-link" onClick={() => setLoaded(true)}>Load map here</button>
        <a className="button-link button-link-ghost" href={openHref} target="_blank" rel="noreferrer">Open in Google Maps</a>
      </div>
    </div>
  );
}
