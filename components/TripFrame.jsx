"use client";

// TripFrame (#33) — the Frame tab. Four briefing panels, all DERIVED from trip
// data (lib/trip-frame.js): a glance fact grid, read-first limitations, a
// booking checklist (checking one persists by flipping the entry to booked),
// and the sources ledger. Honest blanks where a fact is unknown — never a guess.
import { useMemo } from "react";
import { useTrips } from "./TripProvider";
import { glanceFacts, tripLimitations, bookingChecklist, tripSources, markerUnion } from "../lib/trip-frame";

const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function TripFrame({ trip }) {
  const { updateEntry } = useTrips();
  const asOf = todayYmd();
  const facts = useMemo(() => glanceFacts(trip), [trip]);
  const limits = useMemo(() => tripLimitations(trip, asOf), [trip, asOf]);
  const checklist = useMemo(() => bookingChecklist(trip), [trip]);
  const sources = useMemo(() => tripSources(trip), [trip]);
  const markers = useMemo(() => markerUnion(trip), [trip]);

  // Toggle a checklist row's done-state by flipping the entry's status. We only
  // promote toBook → booked here (the honest "I booked it"); un-checking sends
  // it back to toBook. Confirmation-backed rows are already booked — leave them.
  function toggle(row) {
    const e = (trip.entries || []).find((x) => x.id === row.id);
    if (!e || e.booking?.confirmation) return;
    updateEntry(trip.id, { ...e, status: row.done ? "toBook" : "booked" });
  }

  return (
    <div className="tf">
      {/* Glance */}
      <section className="tf-card tf-glance">
        <h3>Glance</h3>
        <dl className="tf-facts">
          {facts.map((f) => (
            <div key={f.label} className={`tf-fact${f.value == null ? " blank" : ""}`}>
              <dt>{f.label}</dt>
              <dd>{f.value == null ? <span className="tf-blank" title={`Not yet known · ${f.source}`}>—</span> : f.value}</dd>
            </div>
          ))}
        </dl>
        {markers.length ? (
          <p className="tf-markers">{markers.map((m) => <span key={m.type} title={m.label}>{m.icon} {m.label}</span>)}</p>
        ) : null}
      </section>

      {/* Limitations — read first */}
      <section className="tf-card tf-limits">
        <h3>Read first</h3>
        {limits.length === 0 ? (
          <p className="tf-clean">✓ Nothing flagged — every stop is pinned, scheduled, and booked.</p>
        ) : (
          <ul>
            {limits.map((l, i) => (
              <li key={i} className={`tf-limit sev-${l.severity}`}>
                <span className="tf-limit-icon">{l.severity === "warn" ? "⚠" : "ℹ"}</span>
                <span className="tf-limit-text">{l.text}</span>
                <span className="tf-cite">{l.source} · {l.asOf}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Booking checklist */}
      <section className="tf-card tf-checklist">
        <h3>Booking checklist <small>{checklist.filter((r) => r.done).length}/{checklist.length}</small></h3>
        {checklist.length === 0 ? (
          <p className="tf-clean">Nothing to book.</p>
        ) : (
          <ul>
            {checklist.map((r) => (
              <li key={r.id} className={`tf-check${r.done ? " done" : ""}`}>
                <button className="tf-box" onClick={() => toggle(r)} title={r.confirmation ? "Confirmed booking" : r.done ? "Mark to-book" : "Mark booked"} disabled={!!r.confirmation}>
                  {r.done ? "✓" : "○"}
                </button>
                <span className="tf-check-title">{r.title}</span>
                <span className="tf-check-meta">
                  {r.confirmation ? <em className="tf-conf">{r.confirmation}</em> : null}
                  {r.bookBy ? <em className="tf-by">book by {r.bookBy}</em> : null}
                  {r.phone ? <a href={`tel:${r.phone}`}>{r.phone}</a> : null}
                  {r.url ? <a href={r.url} target="_blank" rel="noreferrer">link</a> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Sources ledger */}
      <section className="tf-card tf-sources">
        <h3>Sources</h3>
        {sources.length === 0 ? (
          <p className="tf-clean">No cited data yet.</p>
        ) : (
          <ul>
            {sources.map((s, i) => (
              <li key={i} className="tf-source">
                <span className="tf-src-name">{s.source}</span>
                <span className="tf-src-note">{s.note}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="tf-footnote">Every fact above is derived from this trip’s data or left blank — nothing here is invented.</p>
      </section>
    </div>
  );
}
