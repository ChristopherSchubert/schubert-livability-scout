"use client";

// Shared header for the places overview (Board + Compare). Just a single-line
// count/hint `meta` now — the big "Every place" editorial title was dropped
// (2026-06-21, owner: redundant above the controls). Both views render it
// identically so toggling between them doesn't shift the controls vertically.
export default function FunnelHeader({ meta }) {
  if (!meta) return null;
  return (
    <section className="funnel-header" aria-label="Places overview">
      <div className="funnel-header-titles">
        <p className="funnel-meta">{meta}</p>
      </div>
    </section>
  );
}
