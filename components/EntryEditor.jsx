"use client";

// EntryEditor — the v2 entry side sheet (#20, the Phase-1 keystone). Edits the
// v2 atom: title, category × status, time, place (resolved via the place
// picker → /api/places/search), note, structured cost, booking. Writes are
// optimistic + debounced through TripProvider.updateEntry; the place picker is
// the only thing that hits Google (server-side, secret key). Remove deletes.
import { useState, useEffect, useRef } from "react";
import { useTrips } from "./TripProvider";

const CATEGORIES = ["activity", "meal", "travel", "stay", "errand"];
const STATUSES = ["none", "toBook", "reserved", "booked"];

export default function EntryEditor({ tripId, entry, onClose }) {
  const { updateEntry, removeEntry } = useTrips();
  const [draft, setDraft] = useState(entry);
  const [picker, setPicker] = useState({ open: false, query: "", results: [], busy: false, err: "" });
  const firstRef = useRef(null);

  useEffect(() => { setDraft(entry); }, [entry.id]); // eslint-disable-line
  useEffect(() => { firstRef.current?.focus(); }, []);
  // Escape closes the sheet (WCAG: dismissible without the mouse). #38
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Patch the draft locally + push a debounced write (id-keyed) to Supabase.
  function patch(fields) {
    const next = { ...draft, ...fields };
    setDraft(next);
    updateEntry(tripId, { id: next.id, day: next.day, sort: next.sort, ...stripMeta(next) });
  }
  function patchTime(fields) {
    patch({ time: { ...(draft.time || { mode: "range" }), ...fields } });
  }
  function patchCost(fields) {
    const cost = { currency: "EUR", per: "total", ...(draft.cost || {}), ...fields };
    patch({ cost: cost.amount == null || cost.amount === "" ? undefined : cost });
  }

  async function runSearch() {
    const q = picker.query.trim();
    if (!q) return;
    setPicker((p) => ({ ...p, busy: true, err: "" }));
    try {
      const r = await fetch("/api/places/search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, limit: 6 }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setPicker((p) => ({ ...p, results: j.results || [], busy: false }));
    } catch (e) {
      setPicker((p) => ({ ...p, busy: false, err: e.message || "Search failed" }));
    }
  }
  function choosePlace(c) {
    patch({ place: { placeId: c.placeId, name: c.name, lat: c.lat, lon: c.lon, address: c.address } });
    setPicker({ open: false, query: "", results: [], busy: false, err: "" });
  }

  const t = draft.time || {};
  return (
    <div className="ee-scrim" onClick={onClose}>
      <aside className="ee-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Edit entry">
        <header className="ee-head">
          <input ref={firstRef} className="ee-title" value={draft.title || ""} placeholder="Untitled"
                 onChange={(e) => patch({ title: e.target.value })} />
          <button className="ee-x" onClick={onClose} title="Close">✕</button>
        </header>

        <label className="ee-row">
          <span>What</span>
          <select value={draft.category || "activity"} onChange={(e) => patch({ category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={draft.status || "none"} onChange={(e) => patch({ status: e.target.value })}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>

        <label className="ee-row">
          <span>Time</span>
          <input className="ee-time" value={t.start || t.at || ""} placeholder="start (e.g. 10:00)"
                 onChange={(e) => patchTime(t.mode === "point" ? { at: e.target.value } : { mode: "range", start: e.target.value })} />
          <input className="ee-time" value={t.end || ""} placeholder="end"
                 onChange={(e) => patchTime({ mode: "range", end: e.target.value })} />
        </label>

        <div className="ee-row ee-place-row">
          <span>Place</span>
          <div className="ee-place">
            {draft.place ? (
              <div className="ee-place-set">
                <b>{draft.place.name}</b>{draft.place.address ? <small> · {draft.place.address}</small> : null}
                <button className="ee-mini" onClick={() => patch({ place: undefined })}>clear</button>
              </div>
            ) : <span className="ee-null">no place — honest null</span>}
            <button className="ee-mini" onClick={() => setPicker((p) => ({ ...p, open: !p.open }))}>🔍 find a place</button>
            {picker.open ? (
              <div className="ee-picker">
                <div className="ee-picker-bar">
                  <input value={picker.query} placeholder="search Google Places…" autoFocus
                         onChange={(e) => setPicker((p) => ({ ...p, query: e.target.value }))}
                         onKeyDown={(e) => e.key === "Enter" && runSearch()} />
                  <button className="ee-mini" onClick={runSearch} disabled={picker.busy}>{picker.busy ? "…" : "search"}</button>
                </div>
                {picker.err ? <p className="ee-err">{picker.err}</p> : null}
                {picker.results.map((c) => (
                  <button key={c.placeId} className="ee-result" onClick={() => choosePlace(c)}>
                    <b>{c.name}</b><small>{c.address || `${c.lat?.toFixed?.(3)}, ${c.lon?.toFixed?.(3)}`}</small>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <label className="ee-row ee-note-row">
          <span>Note</span>
          <textarea value={draft.note || ""} placeholder="logistics, prep, anything"
                    onChange={(e) => patch({ note: e.target.value })} />
        </label>

        <label className="ee-row">
          <span>Cost</span>
          <input className="ee-cost" type="number" value={draft.cost?.amount ?? ""} placeholder="amount"
                 onChange={(e) => patchCost({ amount: e.target.value === "" ? "" : Number(e.target.value) })} />
          <input className="ee-cur" value={draft.cost?.currency || "EUR"}
                 onChange={(e) => patchCost({ currency: e.target.value })} />
          <label className="ee-check"><input type="checkbox" checked={!!draft.cost?.cashOnly}
                 onChange={(e) => patchCost({ cashOnly: e.target.checked, payment: e.target.checked ? "onSite" : "prepaid" })} /> cash only</label>
        </label>

        <label className="ee-row">
          <span>Booking</span>
          <input value={draft.booking?.confirmation || ""} placeholder="confirmation #"
                 onChange={(e) => patch({ booking: { ...(draft.booking || {}), confirmation: e.target.value } })} />
          <input value={draft.booking?.cancelBy || ""} placeholder="free-cancel by"
                 onChange={(e) => patch({ booking: { ...(draft.booking || {}), cancelBy: e.target.value } })} />
        </label>

        <footer className="ee-foot">
          <button className="ee-danger" onClick={() => { removeEntry(draft.id); onClose(); }}>Remove</button>
          <span className="ee-spacer" />
          <button className="ee-done" onClick={onClose}>Done</button>
        </footer>
      </aside>
    </div>
  );
}

// Everything except the columns (id/day/sort) is the v2 payload atom.
function stripMeta(e) {
  const { id, day, sort, ...payload } = e;
  return payload;
}
