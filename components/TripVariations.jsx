"use client";

// TripVariations (#34) — the "Forks" tab: the deck's "what if" finale. Fork a
// date range into Option A / Option B, switch which one is live (the rest of
// the workspace follows via activeEntries), and watch the decide-by countdown
// (the earliest cancellation deadline across either option). Both futures stay
// alive until you pick one. Forking tags the in-range base entries to Option A;
// switch to Option B and add entries on those days to build the alternative.
import { useMemo, useState } from "react";
import { useTrips } from "./TripProvider";
import { tripDays } from "../lib/trip";
import { tripForks, activeEntries, choiceCounts, forkDecideBy, makeFork, setActiveChoice, entriesForChoice } from "../lib/trip-variations";

function daysUntil(ymd) {
  const m = (ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const target = new Date(+m[1], +m[2] - 1, +m[3]);
  const now = new Date();
  return Math.ceil((target - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}

export default function TripVariations({ trip }) {
  const { updateTripFrame } = useTrips();
  const forks = tripForks(trip);
  const days = useMemo(() => tripDays(trip), [trip]);
  const [name, setName] = useState("");
  const [from, setFrom] = useState(days[0]?.date || "");
  const [to, setTo] = useState(days[days.length - 1]?.date || "");

  function createFork() {
    const f = from || days[0]?.date, t = to || days[days.length - 1]?.date;
    if (!f || !t || f > t) return;
    const fork = makeFork(`fork-${Date.now()}`, name.trim(), f, t);
    // SINGLE atomic frame write — the in-range entries become Option A
    // implicitly (lib/trip-variations.activeEntries), so there's no per-entry
    // write burst that could land after the fork metadata and let another client
    // see the fork before its entries are tagged (#62). Option B starts blank.
    updateTripFrame(trip.id, { options: { ...(trip.options || {}), forks: [...forks, fork] } });
    setName("");
  }

  function pick(forkId, choiceId) {
    updateTripFrame(trip.id, { options: setActiveChoice(trip.options, forkId, choiceId) });
  }

  return (
    <div className="tv">
      <p className="tw-sec-label">What-if — fork a stretch of the trip into two futures, keep both alive until you decide.</p>

      {forks.map((f) => {
        const counts = choiceCounts(trip, f.id);
        const decideBy = forkDecideBy(trip, f.id);
        const left = decideBy != null ? daysUntil(decideBy) : null;
        return (
          <section key={f.id} className="tv-fork">
            <header className="tv-fork-head">
              <b>{f.name}</b>
              <span className="tv-range">{f.range.from} – {f.range.to}</span>
              {decideBy ? (
                <span className={`tv-decide${left != null && left <= 7 ? " soon" : ""}`}>
                  ⏰ decide by {decideBy}{left != null ? ` · ${left}d` : ""}
                </span>
              ) : <span className="tv-decide none">no refundable deadline yet</span>}
            </header>
            <div className="tv-choices">
              {f.choices.map((c) => (
                <button key={c.id} className={`tv-choice${f.activeChoiceId === c.id ? " on" : ""}`}
                        aria-pressed={f.activeChoiceId === c.id} onClick={() => pick(f.id, c.id)}>
                  <b>{c.label}</b>
                  <small>{counts[c.id] || 0} {(counts[c.id] || 0) === 1 ? "entry" : "entries"}</small>
                  {f.activeChoiceId === c.id ? <i className="tv-live">live</i> : null}
                </button>
              ))}
            </div>
            <p className="tv-hint">
              {f.activeChoiceId === "a"
                ? "Option A is live — these days show its plan. Switch to Option B and add entries on those days to build the alternative."
                : `${f.choices.find((c) => c.id === f.activeChoiceId)?.label} is live — add entries on ${f.range.from}–${f.range.to} to fill it out.`}
            </p>

            {/* Side-by-side compare — both futures at once, the live one ringed. */}
            <div className="tv-compare">
              {f.choices.map((c) => {
                const list = entriesForChoice(trip, f.id, c.id);
                return (
                  <div key={c.id} className={`tv-col${f.activeChoiceId === c.id ? " live" : ""}`}>
                    <header>{c.label}{f.activeChoiceId === c.id ? <i> · live</i> : null}</header>
                    {list.length === 0 ? <p className="tv-col-empty">— empty —</p> : (
                      <ul>{list.map((e) => (
                        <li key={e.id}><span className="tv-col-day">{e.day?.slice(5)}</span> {e.title || "Untitled"}{e.booking?.cancelBy ? <em className="tv-col-by"> · by {e.booking.cancelBy}</em> : null}</li>
                      ))}</ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="tv-new">
        <p className="tw-sec-label">Fork a date range</p>
        <div className="tv-form">
          <input className="tv-name" placeholder="name (e.g. Piran vs Trieste)" value={name} onChange={(e) => setName(e.target.value)} />
          <label>from <select value={from} onChange={(e) => setFrom(e.target.value)}>{days.map((d) => <option key={d.date} value={d.date}>{d.date}</option>)}</select></label>
          <label>to <select value={to} onChange={(e) => setTo(e.target.value)}>{days.map((d) => <option key={d.date} value={d.date}>{d.date}</option>)}</select></label>
          <button className="tv-create" onClick={createFork} disabled={!from || !to || from > to}>＋ Create fork</button>
        </div>
      </section>
    </div>
  );
}
