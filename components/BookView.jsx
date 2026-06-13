"use client";

// BookView — the Book tab (#31, #9 rebuild). Deadline-driven action surface:
// Needs action (to-book/reserved + cancelBy) vs Booked (confirmation present),
// itemized cash breakdown, passes with when/where. Nothing stored here —
// lib/trip.js computes everything live from entries.
import { useMemo } from "react";
import { cashNeeded, cashNeededLines, splitBookings, holdPhrase, isUrgent } from "../lib/trip";

function fmtMoney(amount, currency) {
  return `${currency === "EUR" ? "€" : currency + " "}${amount}`;
}

function moneyTotals(map) {
  const parts = Object.entries(map || {}).map(([c, n]) => fmtMoney(n, c));
  return parts.join(" · ") || "—";
}

// A single row in the ledger. `onEdit` is called with the entry to open the
// EntryEditor prefilled. `urgent` adds a visual highlight class.
function LedgerRow({ entry, onEdit, urgent, section }) {
  const phrase = holdPhrase(entry);
  const isActionable = section === "needsAction";
  return (
    <li className={`bk-row${urgent ? " bk-urgent" : ""}${isActionable ? " bk-action" : ""}`}>
      <span className="bk-title">
        {entry.title || "—"}
        {entry.place ? <em> · {entry.place.name}</em> : null}
      </span>
      {entry.booking?.confirmation
        ? <span className="bk-conf">{entry.booking.confirmation}</span>
        : null}
      {phrase ? <span className={`bk-phrase${urgent ? " bk-due" : " bk-okk"}`}>{phrase}</span> : null}
      {isActionable && onEdit
        ? <button className="bk-mark" onClick={() => onEdit(entry)}>mark booked…</button>
        : null}
    </li>
  );
}

export default function BookView({ trip, onEdit }) {
  const { needsAction, booked } = useMemo(
    () => (trip ? splitBookings(trip) : { needsAction: [], booked: [] }),
    [trip]
  );
  const cash = useMemo(() => (trip ? cashNeeded(trip) : {}), [trip]);
  const cashLines = useMemo(() => (trip ? cashNeededLines(trip) : []), [trip]);
  const passes = trip?.passes || [];

  // Reference date for urgency: today (YYYY-MM-DD). If the trip starts sooner,
  // use the trip start as the reference so cancelBy rows near the start get flagged.
  const today = new Date().toISOString().slice(0, 10);
  const ref = trip?.startDate && trip.startDate < today ? today : (trip?.startDate || today);
  const urgentRef = ref < today ? today : ref;

  const totalCount = needsAction.length + booked.length;

  return (
    <div className="bk">
      {/* ── Needs action ── */}
      <section className="bk-sec">
        <h2 className="bk-h bk-h-action">
          Needs action
          {needsAction.length > 0
            ? <span className="bk-count bk-count-warn">{needsAction.length}</span>
            : <span className="bk-count bk-count-clear">✓ clear</span>}
        </h2>
        {needsAction.length === 0
          ? <p className="bk-note">Nothing waiting — all reservations have a confirmation.</p>
          : (
            <ul className="bk-ledger">
              {needsAction.map((e) => (
                <LedgerRow
                  key={e.id}
                  entry={e}
                  onEdit={onEdit}
                  urgent={isUrgent(e, urgentRef)}
                  section="needsAction"
                />
              ))}
            </ul>
          )}
      </section>

      {/* ── Booked ── */}
      <section className="bk-sec">
        <h2 className="bk-h">
          Booked
          <span className="bk-count">{booked.length}</span>
        </h2>
        {booked.length === 0
          ? <p className="bk-note">No confirmed bookings yet.</p>
          : (
            <ul className="bk-ledger">
              {booked.map((e) => (
                <LedgerRow
                  key={e.id}
                  entry={e}
                  onEdit={onEdit}
                  urgent={isUrgent(e, urgentRef)}
                  section="booked"
                />
              ))}
            </ul>
          )}
        {totalCount === 0
          ? <p className="bk-note" style={{ marginTop: ".4rem" }}>No confirmations or deadlines yet.</p>
          : null}
      </section>

      {/* ── Cash to carry ── */}
      <section className="bk-sec">
        <h2 className="bk-h">
          Cash to carry
          <span className="bk-big">{moneyTotals(cash)}</span>
        </h2>
        <p className="bk-note">On-site, cash-only costs — bring it in notes.</p>
        {cashLines.length > 0 && (
          <ul className="bk-cashlines">
            {cashLines.map((l, i) => (
              <li key={i} className="bk-cashline">
                <span className="bk-cashline-title">{l.title || "—"}</span>
                <span className="bk-cashline-amount">{fmtMoney(l.amount, l.currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Passes ── */}
      <section className="bk-sec">
        <h2 className="bk-h">Passes <span className="bk-count">{passes.length}</span></h2>
        {passes.length === 0
          ? <p className="bk-note">No passes.</p>
          : (
            <ul className="bk-passes">
              {passes.map((p) => (
                <li key={p.id} className="bk-pass-row">
                  <span className="bk-pass-name">🎟 {p.name}</span>
                  {p.covers ? <em className="bk-pass-covers">{p.covers}</em> : null}
                  {p.when ? <span className="bk-pass-when">{p.when}</span> : null}
                  {p.where ? <span className="bk-pass-where">{p.where}</span> : null}
                  {p.cost != null ? <span className="bk-cost">{p.cost}</span> : null}
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}
