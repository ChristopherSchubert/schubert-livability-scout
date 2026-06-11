"use client";

// TripsIndex (issue #18) — the /trips list + the composer (issue #19) inline.
// Reads from TripProvider only (Supabase system-of-record). Thin: all data
// logic is in lib/trip.js / lib/db.js.
import Link from "next/link";
import { useState } from "react";
import { useTrips } from "./TripProvider";
import { tripDays } from "../lib/trip";

export default function TripsIndex() {
  const { trips, hydrated, saveState, createTrip } = useTrips();

  if (!hydrated) return <div className="trip-ws">Loading trips…</div>;

  return (
    <div className="trip-ws">
      <div className="trip-ws-head">
        <h1>Trips</h1>
        <span className="trip-save" data-status={saveState.status}>
          {saveState.status === "saving"
            ? "Saving…"
            : saveState.status === "error"
              ? "Save failed"
              : ""}
        </span>
      </div>

      <TripComposer onCreate={createTrip} />

      {trips.length === 0 ? (
        <p className="trip-ws-sub">No trips yet — compose one above.</p>
      ) : (
        <div className="trip-grid">
          {trips.map((t) => {
            const days = tripDays(t);
            return (
              <Link key={t.id} href={`/trips/${t.id}`} className="trip-card">
                <strong>{t.name || "Untitled trip"}</strong>
                <div className="trip-card-dates">
                  {t.startDate || "—"} → {t.endDate || "—"}
                  {days.length ? ` · ${days.length} days` : ""}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// TripComposer (issue #19) — name + concrete provisional dates + traveler rows.
// A trip ALWAYS carries concrete dates (the provisional-dates rule, spec §4.3):
// the form requires a real start/end so the window can render from minute one.
function TripComposer({ onCreate }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [travelers, setTravelers] = useState([{ name: "", kind: "person", chips: [] }]);
  const [busy, setBusy] = useState(false);

  const CHIPS = ["veg", "dog", "kid", "patio", "accessible"];

  function toggleChip(i, chip) {
    setTravelers((rows) =>
      rows.map((r, j) =>
        j === i
          ? {
              ...r,
              chips: r.chips.includes(chip)
                ? r.chips.filter((c) => c !== chip)
                : [...r.chips, chip],
            }
          : r
      )
    );
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || !start || !end) return;
    setBusy(true);
    try {
      await onCreate({
        name: name.trim(),
        startDate: start,
        endDate: end,
        travelers: travelers.filter((t) => t.name.trim()),
      });
      setName("");
      setStart("");
      setEnd("");
      setTravelers([{ name: "", kind: "person", chips: [] }]);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="auth-ghost"
        onClick={() => setOpen(true)}
        style={{ marginBottom: "1rem" }}
      >
        + New trip
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="trip-card" style={{ marginBottom: "1rem" }}>
      <div className="entry-field">
        <span>Trip name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Slovenia, ~10 days"
          autoFocus
          required
        />
      </div>
      <div className="entry-row">
        <label className="entry-field">
          <span>Start (provisional)</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
        </label>
        <label className="entry-field">
          <span>End</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
        </label>
      </div>
      <div className="entry-field">
        <span>Travelers (chips drive which markers light up)</span>
        {travelers.map((t, i) => (
          <div
            key={i}
            className="entry-row"
            style={{ gridTemplateColumns: "1fr 1fr", alignItems: "center" }}
          >
            <input
              value={t.name}
              onChange={(e) =>
                setTravelers((rows) =>
                  rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r))
                )
              }
              placeholder={t.kind === "pet" ? "Pet name" : "Name"}
            />
            <select
              value={t.kind}
              onChange={(e) =>
                setTravelers((rows) =>
                  rows.map((r, j) => (j === i ? { ...r, kind: e.target.value } : r))
                )
              }
            >
              <option value="person">Person</option>
              <option value="pet">Pet</option>
            </select>
            <div className="marker-set" style={{ gridColumn: "1 / -1" }}>
              {CHIPS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="marker-chip"
                  data-attr={c}
                  aria-pressed={t.chips.includes(c)}
                  style={{ opacity: t.chips.includes(c) ? 1 : 0.45 }}
                  onClick={() => toggleChip(i, c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button
          type="button"
          className="auth-ghost"
          onClick={() => setTravelers((r) => [...r, { name: "", kind: "person", chips: [] }])}
        >
          + Add traveler
        </button>
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="submit"
          className="auth-primary"
          disabled={busy || !name.trim() || !start || !end}
        >
          {busy ? "Creating…" : "Create trip"}
        </button>
        <button type="button" className="auth-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
