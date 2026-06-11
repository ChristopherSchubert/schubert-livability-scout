"use client";

// TripDetail (issue #15) — the orchestrator for one trip. Wires the DayPlan
// (#28) / GridView (#29) views, the EntryEditor side sheet (#20), the BookPanel
// (#31), and the TripGlance frame (#33). Reads/writes through TripProvider only.
import { useState } from "react";
import Link from "next/link";
import { useTrip, useTrips } from "./TripProvider";
import { markerUnion, cashNeeded, reservationLedger } from "../lib/trip";
import DayPlan from "./trip/DayPlan";
import GridView from "./trip/GridView";
import EntryEditor from "./trip/EntryEditor";
import BookPanel from "./trip/BookPanel";
import GatherPanel from "./trip/GatherPanel";
import TripDndContext from "./trip/TripDndContext";
import DayMap from "./trip/DayMap";
import TransportSection from "./trip/TransportSection";
import TripWindow from "./trip/TripWindow";
import StaySection from "./trip/StaySection";
import ErrorBoundary from "./trip/ErrorBoundary";
import { tripDays } from "../lib/trip";

// New entries need a stable client id so optimistic state + the upsert agree
// (the trip_entries pk is a uuid; a client-minted one round-trips cleanly).
const newId = () =>
  globalThis.crypto?.randomUUID
    ? crypto.randomUUID()
    : `e_${Date.now()}_${Math.random().toString(36).slice(2)}`;

export default function TripDetail({ id }) {
  const active = useTrip(id);
  const { hydrated, saveState, updateEntry, removeEntry, updateTrip } = useTrips();
  const [editing, setEditing] = useState(null); // entry being edited (or a new draft)
  const [view, setView] = useState("agenda");

  if (!hydrated) return <div className="trip-ws">Loading…</div>;
  if (!active || active.trip.id !== id) return <div className="trip-ws">Opening trip…</div>;

  const trip = { ...active.trip, entries: active.entries };
  const markers = markerUnion(trip);
  // a11y live region (#38): a one-line summary screen readers announce on change.
  const cash =
    Object.entries(cashNeeded(trip))
      .map(([c, a]) => `${a} ${c}`)
      .join(", ") || "none";
  const liveSummary = `Trip ${trip.name || "untitled"}: ${trip.entries.length} entries, cash to carry ${cash}, ${reservationLedger(trip).length} reservations.`;
  // Lodging pin near the editor's place search = first leg's stay, if any.
  const near = (trip.legs || [])[0]?.lodging
    ? { lat: trip.legs[0].lodging.lat, lon: trip.legs[0].lodging.lon }
    : undefined;

  function addEntry(day) {
    setEditing({
      day,
      role: "anchor",
      category: "activity",
      status: "none",
      time: { mode: "bucket", bucket: "morning" },
    });
  }
  function applySolve(_date, entries) {
    // Persist each solved entry (per-entry writes; the provider debounces).
    entries.forEach((e) => updateEntry(id, { ...e, id: e.id || newId() }));
  }
  function saveEntry(e) {
    updateEntry(id, { ...e, id: e.id || newId(), day: e.day || editing?.day });
  }
  // Gather "+ Add" / a pool→day drop lands a candidate on a day as an anchor.
  function addCandidate(entryDraft, day) {
    const targetDay = day || tripDays(trip)[0]?.date || trip.startDate;
    updateEntry(id, { ...entryDraft, id: newId(), day: targetDay });
  }
  function handleDrop({ active, over }) {
    if (!active || !over) return;
    if (active.type === "pool" && over.type === "day") addCandidate(active.entry, over.day);
    else if (active.type === "entry" && over.type === "day" && active.entry?.id) {
      updateEntry(id, { id: active.entry.id, day: over.day }); // move to another day
    }
  }

  return (
    <ErrorBoundary>
      <div className="trip-ws">
        <p className="sr-only" role="status" aria-live="polite">
          {liveSummary}
        </p>
        <div className="trip-ws-head">
          <div>
            <Link href="/trips" className="trip-ws-sub">
              ← Trips
            </Link>
            <h1>{trip.name || "Untitled trip"}</h1>
            <div className="trip-ws-sub">
              {trip.startDate} → {trip.endDate}
              {markers.length ? ` · markers: ${markers.join(", ")}` : ""}
            </div>
          </div>
          <span className="trip-save" data-status={saveState.status}>
            {saveState.status === "saving"
              ? "Saving…"
              : saveState.status === "saved"
                ? "Saved"
                : saveState.status === "error"
                  ? "Save failed"
                  : ""}
          </span>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <button
            type="button"
            className="auth-ghost"
            aria-pressed={view === "agenda"}
            onClick={() => setView("agenda")}
          >
            Agenda
          </button>
          <button
            type="button"
            className="auth-ghost"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
            Grid
          </button>
        </div>

        <TripWindow trip={trip} onUpdate={(patch) => updateTrip(id, patch)} />

        <TripDndContext onDrop={handleDrop}>
          {view === "agenda" ? (
            <DayPlan
              trip={trip}
              onEditEntry={setEditing}
              onAddEntry={addEntry}
              onApplySolve={applySolve}
            />
          ) : (
            <GridView trip={trip} onEditEntry={setEditing} />
          )}
        </TripDndContext>

        <StaySection trip={trip} onUpdate={(patch) => updateTrip(id, patch)} />

        <TransportSection trip={trip} onEditEntry={setEditing} />

        <DayMap trip={trip} />

        <GatherPanel trip={trip} onAdd={(draft) => addCandidate(draft)} />

        <BookPanel trip={trip} />

        {editing ? (
          <EntryEditor
            entry={editing}
            tripId={id}
            near={near}
            onSave={saveEntry}
            onDelete={(eid) => removeEntry(id, eid)}
            onClose={() => setEditing(null)}
          />
        ) : null}
      </div>
    </ErrorBoundary>
  );
}
