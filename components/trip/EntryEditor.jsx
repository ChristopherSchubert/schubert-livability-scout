"use client";

// EntryEditor (issue #20) — the v2 entry side sheet (the keystone editor). Edits
// the full atom where you see it; one Save → one updateEntry write. Focus-
// trapped, Esc closes. Place picker hits /api/places/search (#13). Spec §4.4b.
import { useEffect, useRef, useState } from "react";
import { ENTRY_CATEGORIES, ENTRY_STATUSES } from "../../lib/trip";

const CURRENCIES = ["EUR", "USD", "GBP", "CHF"];

export default function EntryEditor({ entry, tripId, near, onSave, onDelete, onClose }) {
  const [draft, setDraft] = useState(() => normalize(entry));
  const [placeQuery, setPlaceQuery] = useState("");
  const [candidates, setCandidates] = useState(null);
  const [searching, setSearching] = useState(false);
  const sheetRef = useRef(null);

  useEffect(() => setDraft(normalize(entry)), [entry]);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    sheetRef.current?.querySelector("input,select,textarea")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setCost = (patch) => setDraft((d) => ({ ...d, cost: { ...d.cost, ...patch } }));

  async function searchPlace() {
    if (!placeQuery.trim()) return;
    setSearching(true);
    try {
      const r = await fetch("/api/places/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: placeQuery, near }),
      });
      const d = await r.json();
      setCandidates(d.results || []);
    } catch {
      setCandidates([]);
    } finally {
      setSearching(false);
    }
  }

  function pickPlace(c) {
    // Editing a solved time auto-pins is handled on time edit; here we resolve place.
    set({
      place: { placeId: c.placeId, name: c.name, lat: c.lat, lon: c.lon, address: c.address },
    });
    setCandidates(null);
    setPlaceQuery("");
  }

  function save() {
    onSave({ ...draft, id: entry.id });
    onClose();
  }

  return (
    <>
      <div className="entry-sheet-backdrop" onClick={onClose} />
      <aside
        className="entry-sheet"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Edit entry"
      >
        <h2>{entry.id ? "Edit entry" : "New entry"}</h2>

        <label className="entry-field">
          <span>Title</span>
          <input value={draft.title} onChange={(e) => set({ title: e.target.value })} />
        </label>

        <div className="entry-row">
          <label className="entry-field">
            <span>Category</span>
            <select value={draft.category} onChange={(e) => set({ category: e.target.value })}>
              {ENTRY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="entry-field">
            <span>Status</span>
            <select value={draft.status} onChange={(e) => set({ status: e.target.value })}>
              {ENTRY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset
          className="entry-field"
          style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "0.5rem" }}
        >
          <legend>When</legend>
          <select
            value={draft.time.mode}
            onChange={(e) => set({ time: { ...draft.time, mode: e.target.value } })}
          >
            <option value="bucket">Time of day (fuzzy)</option>
            <option value="point">Exact time</option>
            <option value="range">Range</option>
          </select>
          {draft.time.mode === "bucket" ? (
            <select
              value={draft.time.bucket || "morning"}
              onChange={(e) => set({ time: { ...draft.time, bucket: e.target.value } })}
            >
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
            </select>
          ) : (
            <div className="entry-row">
              <input
                type="time"
                value={draft.time.at || draft.time.start || ""}
                onChange={(e) =>
                  set({ time: { ...draft.time, at: e.target.value, start: e.target.value } })
                }
              />
              {draft.time.mode === "range" ? (
                <input
                  type="time"
                  value={draft.time.end || ""}
                  onChange={(e) => set({ time: { ...draft.time, end: e.target.value } })}
                />
              ) : null}
            </div>
          )}
          <label className="entry-field">
            <span>Duration (min)</span>
            <input
              type="number"
              value={draft.durationMin}
              onChange={(e) => set({ durationMin: Number(e.target.value) })}
            />
          </label>
        </fieldset>

        <fieldset
          className="entry-field"
          style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "0.5rem" }}
        >
          <legend>Place</legend>
          {draft.place?.name ? (
            <p>
              📍 {draft.place.name} {draft.place.placeId ? "(resolved)" : ""}
            </p>
          ) : (
            <p className="trip-ws-sub">No place yet.</p>
          )}
          <div className="entry-row">
            <input
              value={placeQuery}
              onChange={(e) => setPlaceQuery(e.target.value)}
              placeholder="Search a place…"
            />
            <button type="button" className="auth-ghost" onClick={searchPlace} disabled={searching}>
              {searching ? "…" : "Search"}
            </button>
          </div>
          {candidates ? (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {candidates.length === 0 ? <li className="trip-ws-sub">No matches.</li> : null}
              {candidates.map((c) => (
                <li key={c.placeId}>
                  <button type="button" className="auth-ghost" onClick={() => pickPlace(c)}>
                    {c.name} — {c.address}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </fieldset>

        <fieldset
          className="entry-field"
          style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "0.5rem" }}
        >
          <legend>Money</legend>
          <div className="entry-row">
            <input
              type="number"
              placeholder="Amount"
              value={draft.cost.amount ?? ""}
              onChange={(e) =>
                setCost({ amount: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
            <select
              value={draft.cost.currency}
              onChange={(e) => setCost({ currency: e.target.value })}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <label>
            <input
              type="radio"
              name="pay"
              checked={draft.cost.payment === "prepaid"}
              onChange={() => setCost({ payment: "prepaid" })}
            />{" "}
            Prepaid
          </label>
          <label>
            <input
              type="radio"
              name="pay"
              checked={draft.cost.payment === "onSite"}
              onChange={() => setCost({ payment: "onSite" })}
            />{" "}
            On site
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!draft.cost.cashOnly}
              onChange={(e) => setCost({ cashOnly: e.target.checked })}
            />{" "}
            Cash only
          </label>
        </fieldset>

        <label className="entry-field">
          <span>Note</span>
          <textarea rows={2} value={draft.note} onChange={(e) => set({ note: e.target.value })} />
        </label>

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
          <button type="button" className="auth-primary" onClick={save}>
            Save
          </button>
          {entry.id ? (
            <button
              type="button"
              className="auth-ghost"
              onClick={() => {
                onDelete(entry.id);
                onClose();
              }}
            >
              Delete
            </button>
          ) : null}
          <button type="button" className="auth-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </aside>
    </>
  );
}

function normalize(entry) {
  return {
    title: entry.title || "",
    category: entry.category || "activity",
    status: entry.status || "none",
    role: entry.role || "anchor",
    day: entry.day || null,
    time: entry.time || { mode: "bucket", bucket: "morning" },
    durationMin: entry.durationMin || 60,
    place: entry.place || null,
    note: entry.note || "",
    cost: entry.cost || { amount: null, currency: "EUR", payment: "onSite", cashOnly: false },
    booking: entry.booking || {},
    markers: entry.markers || [],
  };
}
