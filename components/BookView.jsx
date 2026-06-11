"use client";

// BookView — the Book tab (#31, cheap because it's all DERIVED). Reservations
// ledger (entries with a confirmation or a free-cancel deadline, soonest
// first), cash needed by currency, and the trip's passes. Nothing stored —
// lib/trip.js computes it live from the entries.
import { useMemo } from "react";
import { bookingsLedger, cashNeeded } from "../lib/trip";

function money(map) {
  const parts = Object.entries(map || {}).map(([c, n]) => `${c === "EUR" ? "€" : c + " "}${n}`);
  return parts.join(" · ") || "—";
}

export default function BookView({ trip }) {
  const ledger = useMemo(() => (trip ? bookingsLedger(trip) : []), [trip]);
  const cash = useMemo(() => (trip ? cashNeeded(trip) : {}), [trip]);
  const passes = trip?.passes || [];

  return (
    <div className="bk">
      <section className="bk-sec">
        <h2 className="bk-h">Cash needed <span className="bk-big">{money(cash)}</span></h2>
        <p className="bk-note">Sum of cash-only costs (paid on site), by currency — bring it in notes.</p>
      </section>

      <section className="bk-sec">
        <h2 className="bk-h">Bookings <span className="bk-count">{ledger.length}</span></h2>
        {ledger.length === 0 ? <p className="bk-note">No confirmations or deadlines yet.</p> : (
          <ul className="bk-ledger">
            {ledger.map((e) => (
              <li key={e.id} className="bk-row">
                <span className="bk-title">{e.title}{e.place ? <em> · {e.place.name}</em> : null}</span>
                <span className="bk-deadline">{e.booking?.cancelBy ? `free-cancel by ${e.booking.cancelBy}` : ""}</span>
                <span className="bk-conf">{e.booking?.confirmation || ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bk-sec">
        <h2 className="bk-h">Passes <span className="bk-count">{passes.length}</span></h2>
        {passes.length === 0 ? <p className="bk-note">No passes.</p> : (
          <ul className="bk-passes">
            {passes.map((p) => <li key={p.id}>🎟 {p.name}{p.cost != null ? <span className="bk-cost"> · {p.cost}</span> : null}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
