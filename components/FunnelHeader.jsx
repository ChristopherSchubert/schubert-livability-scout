"use client";

// Shared header for the places overview (Board + Compare). Both views render
// it identically so toggling between them no longer shifts the controls/content
// vertically (Board used to carry a tall header and Compare none, so the
// ViewToggle jumped ~124px on switch). Compact by design — the title block was
// eating a lot of space. The ViewToggle lives in the controls bar below.
//
// `meta` should be a single-line node so the header height matches across views.
export default function FunnelHeader({ meta }) {
  return (
    <section className="funnel-header" aria-labelledby="funnel-header-title">
      <div className="funnel-header-titles">
        <p className="page-eyebrow">Places</p>
        <h1 id="funnel-header-title">Every place</h1>
        {meta ? <p className="funnel-meta">{meta}</p> : null}
      </div>
    </section>
  );
}
