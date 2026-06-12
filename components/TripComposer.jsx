"use client";

// TripComposer — create a new trip (#19). Name, provisional dates, and traveler
// rows (each a person/pet with chips — the union is the trip's marker set).
// createTrip inserts it owned by the current user; then we route into it. The
// window/legs are filled in on the Plan tab.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTrips } from "./TripProvider";

const CHIP_OPTIONS = ["veg", "vegan", "nut allergy", "limited mobility", "kid"];

export default function TripComposer({ onClose }) {
  const { createTrip } = useTrips();
  const router = useRouter();
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [travelers, setTravelers] = useState([{ name: "", kind: "person", chips: [] }]);
  const [busy, setBusy] = useState(false);

  function setTrav(i, patch) { setTravelers((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t))); }
  function toggleChip(i, chip) {
    setTravelers((ts) => ts.map((t, j) => j === i ? { ...t, chips: t.chips.includes(chip) ? t.chips.filter((c) => c !== chip) : [...t.chips, chip] } : t));
  }
  function addTraveler() { setTravelers((ts) => [...ts, { name: "", kind: "person", chips: [] }]); }

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    const clean = travelers.filter((t) => t.name.trim());
    const trip = await createTrip({
      name: name.trim(),
      startDate: start || null,
      endDate: end || null,
      travelers: clean,
      glance: { destination: name.trim() },
      legs: [],
    });
    setBusy(false);
    if (trip?.id) { onClose?.(); router.push(`/trips/${trip.id}`); }
  }

  return (
    <div className="tc-scrim" onClick={onClose}>
      <aside className="tc-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="New trip">
        <header className="tc-head"><h2>New trip</h2><button className="ee-x" onClick={onClose}>✕</button></header>

        <label className="tc-field"><span>Where</span>
          <input autoFocus value={name} placeholder="Slovenia, the Dolomites, a long weekend…"
                 onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.metaKey && create()} />
        </label>
        <div className="tc-dates">
          <label className="tc-field"><span>From <em>provisional</em></span><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="tc-field"><span>To</span><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>

        <div className="tc-travs">
          <span className="tc-label">Travelers <em>— chips ride with each one onto every screen</em></span>
          {travelers.map((t, i) => (
            <div key={i} className="tc-trav">
              <select value={t.kind} onChange={(e) => setTrav(i, { kind: e.target.value })}>
                <option value="person">🧑</option><option value="pet">🐾</option>
              </select>
              <input value={t.name} placeholder="name" onChange={(e) => setTrav(i, { name: e.target.value })} />
              <div className="tc-chips">
                {CHIP_OPTIONS.map((chip) => (
                  <button key={chip} type="button" className={`tc-chip${t.chips.includes(chip) ? " on" : ""}`}
                          onClick={() => toggleChip(i, chip)}>{chip}</button>
                ))}
              </div>
            </div>
          ))}
          <button className="ee-mini" onClick={addTraveler}>＋ traveler</button>
        </div>

        <footer className="tc-foot">
          <button className="ee-mini" onClick={onClose}>Cancel</button>
          <span className="ee-spacer" />
          <button className="ee-done" onClick={create} disabled={!name.trim() || busy}>{busy ? "Creating…" : "Create trip →"}</button>
        </footer>
      </aside>
    </div>
  );
}
