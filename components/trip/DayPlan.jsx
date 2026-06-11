"use client";

// DayPlan / AgendaView (issue #28) — the narrative day view. Groups entries by
// day → time-of-day buckets, renders EntryCards, flags tz changes (#37) and
// surfaces the Solve button (which runs the adapter + solver, #27). Feasibility
// flags (#32) come straight from the solver — over-packed days are shown, never
// silently dropped. GridView (#29) is a view-swap over the same data (toggle).
import { useState } from "react";
import { entriesByDay, tripDays, legTzChanges, TIME_BUCKETS } from "../../lib/trip";
import { solveTripDay } from "../../lib/solve-adapter";
import { solveDay } from "../../lib/solve";
import { EntryCard } from "./atoms";

const BUCKET_LABEL = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };

export default function DayPlan({ trip, onEditEntry, onAddEntry, onApplySolve }) {
  const [flagsByDay, setFlagsByDay] = useState({});
  const days = tripDays(trip);
  const byDay = entriesByDay(trip);
  const tzChanges = Object.fromEntries(legTzChanges(trip).map((c) => [c.date, c]));

  if (!days.length) {
    return <p className="trip-ws-sub">Set trip dates to lay out days.</p>;
  }

  function solve(date, lodgingPin, tz) {
    const { result, entries } = solveTripDay(solveDay, trip, date, {
      lodging: lodgingPin,
      dayStart: "08:00",
      dayEnd: "22:00",
      mealWindows: [
        { name: "Lunch", from: "12:00", to: "14:00", durationMin: 60 },
        { name: "Dinner", from: "18:30", to: "20:30", durationMin: 90 },
      ],
    });
    setFlagsByDay((f) => ({ ...f, [date]: result.flags }));
    onApplySolve?.(date, entries, result);
  }

  return (
    <div>
      {days.map((d) => {
        const entries = byDay[d.date] || [];
        const tzLabel = d.tz ? d.tz.split("/").pop().replace("_", " ") : null;
        const tzFlag = tzChanges[d.date];
        const flags = flagsByDay[d.date] || [];
        // entries with a fuzzy bucket group under it; timed ones list in order.
        const timed = entries.filter((e) => e.time && e.time.mode !== "bucket");
        const buckets = TIME_BUCKETS.map((b) => ({
          b,
          items: entries.filter((e) => e.time?.mode === "bucket" && e.time.bucket === b),
        })).filter((g) => g.items.length);

        return (
          <section key={d.date} className="day-section">
            <div className="day-section-head">
              {d.date}
              {d.legName ? <small> · {d.legName}</small> : null}
              {tzLabel ? <small className="trip-ws-sub"> · {tzLabel}</small> : null}
            </div>

            {tzFlag ? (
              <div className="day-flag">
                ⏰ Clocks change: {tzFlag.from.split("/").pop()} → {tzFlag.to.split("/").pop()}
              </div>
            ) : null}
            {flags.map((f, i) => (
              <div key={i} className="day-flag">
                ⚠️ {f}
              </div>
            ))}

            <div className="entry-list">
              {timed.map((e) => (
                <EntryCard key={e.id} entry={e} tzLabel={tzLabel} onClick={() => onEditEntry(e)} />
              ))}
            </div>
            {buckets.map((g) => (
              <div key={g.b}>
                <div className="day-bucket">{BUCKET_LABEL[g.b]}</div>
                <div className="entry-list">
                  {g.items.map((e) => (
                    <EntryCard
                      key={e.id}
                      entry={e}
                      tzLabel={tzLabel}
                      onClick={() => onEditEntry(e)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {!entries.length ? <p className="trip-ws-sub">Nothing planned.</p> : null}

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem" }}>
              <button type="button" className="auth-ghost" onClick={() => onAddEntry(d.date)}>
                + Add
              </button>
              <button
                type="button"
                className="auth-ghost"
                onClick={() => solve(d.date, lodgingFor(trip, d), d.tz)}
                title="Order the day, insert travel, fit the clock"
              >
                ⚙︎ Solve day
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

// Best lodging pin for a day = the covering leg's chosen stay, if any.
function lodgingFor(trip, day) {
  const leg = (trip.legs || []).find((l) => l.cityId === day.cityId) || (trip.legs || [])[0];
  const stay = leg?.candidates?.find((c) => c.id === leg.chosenId);
  if (stay?.place?.lat != null)
    return { lat: stay.place.lat, lon: stay.place.lon, name: stay.name };
  if (leg?.lodging?.lat != null)
    return { lat: leg.lodging.lat, lon: leg.lodging.lon, name: leg.lodging.name };
  return null;
}
