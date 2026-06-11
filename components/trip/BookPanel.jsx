"use client";

// BookPanel (issue #31) — reservations, cash, passes, ALL DERIVED from entries
// via lib/trip.js helpers (#10). Nothing stored here; it reads the spine.
import { reservationLedger, bookingChecklist, cashNeeded } from "../../lib/trip";

export default function BookPanel({ trip }) {
  const ledger = reservationLedger(trip);
  const checklist = bookingChecklist(trip);
  const cash = cashNeeded(trip);
  const cashText =
    Object.entries(cash)
      .map(([cur, amt]) => `${amt} ${cur}`)
      .join(" + ") || "—";

  return (
    <div className="trip-card" style={{ marginTop: "1rem" }}>
      <h2>Book</h2>

      <h3>Cash to carry</h3>
      <p className="benchmark-pill">
        {cashText} <small className="trip-ws-sub">(on-site + cash-only only)</small>
      </p>

      <h3>To book ({checklist.length})</h3>
      {checklist.length === 0 ? (
        <p className="trip-ws-sub">Nothing outstanding.</p>
      ) : (
        <ul>
          {checklist.map((c) => (
            <li key={c.id}>
              {c.title}
              {c.bookBy ? ` — book by ${c.bookBy}` : ""}
              {c.leadTime ? ` (${c.leadTime})` : ""}
            </li>
          ))}
        </ul>
      )}

      <h3>Reservations ({ledger.length})</h3>
      {ledger.length === 0 ? (
        <p className="trip-ws-sub">No held slots yet.</p>
      ) : (
        <ul>
          {ledger.map((e) => (
            <li key={e.id}>
              {e.category === "stay" ? "🛏 " : ""}
              {e.title}
              {e.booking?.confirmation ? (
                <>
                  {" "}
                  · <code>{e.booking.confirmation}</code>
                </>
              ) : null}
              {e.booking?.cancelBy ? <em> · cancel by {e.booking.cancelBy}</em> : null}
            </li>
          ))}
        </ul>
      )}

      {(trip.passes || []).length ? (
        <>
          <h3>Passes</h3>
          <ul>
            {trip.passes.map((p) => (
              <li key={p.id}>
                {p.name}
                {p.cost ? ` — ${p.cost}` : ""}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
