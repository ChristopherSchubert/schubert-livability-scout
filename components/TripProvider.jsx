"use client";

// Trips are a distinct domain from cities (real-time co-editing), so they get
// a parallel provider to PlannerProvider (#12). It loads the user's trips,
// hydrates the active trip's entries from trip_entries, exposes selectors +
// DEBOUNCED writers, and merges real-time changes — suppressing echoes of the
// user's own in-flight writes so their cursor doesn't jump. Supabase is the
// only system of record (no localStorage, no seed maps).
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchMyTrips, fetchTrip, insertTrip, updateTrip, deleteTrip,
  upsertEntry, deleteEntry, reorderEntries, subscribeTrip,
} from "../lib/db";
import { useAuth } from "./AuthGate";

const TripContext = createContext(null);

// Entries are ordered by day, then within-day sort.
function byDayThenSort(a, b) {
  return (a.day || "").localeCompare(b.day || "") || (a.sort ?? 0) - (b.sort ?? 0);
}
function upsertLocal(entries, entry) {
  const i = entries.findIndex((e) => e.id === entry.id);
  const next = entries.slice();
  if (i >= 0) next[i] = { ...next[i], ...entry }; else next.push(entry);
  return next.sort(byDayThenSort);
}

const ECHO_MS = 4000; // ignore remote echoes of our own writes within this window

export function TripProvider({ children }) {
  const { userId } = useAuth();
  const [trips, setTrips] = useState([]);
  const [active, setActive] = useState(null); // full trip: frame + entries[]
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState({ status: "idle", at: 0 });

  const entryTimers = useRef({});   // per-entry debounce timer
  const entryPending = useRef({});  // per-entry accumulated patch
  const tripTimers = useRef({});    // per-trip frame debounce timer
  const tripPending = useRef({});
  const ownWrites = useRef({});     // entryId → ts of our last write (echo suppression)
  const unsubRef = useRef(null);
  const activeIdRef = useRef(null);

  // ── Load the user's trips on mount ────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const t = await fetchMyTrips(userId);
        if (!cancelled) setTrips(t);
      } catch (e) {
        console.error("Trips load failed:", e.message);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Tear down the real-time channel on unmount.
  useEffect(() => () => { if (unsubRef.current) unsubRef.current(); }, []);

  function flash(run) {
    setSaveState({ status: "saving", at: Date.now() });
    return Promise.resolve(run())
      .then((r) => { setSaveState({ status: "saved", at: Date.now() }); return r; })
      .catch((e) => { console.error(e.message); setSaveState({ status: "error", at: Date.now() }); });
  }

  // ── Real-time merge (the riskiest bit) ────────────────────────────────────
  // Entry-keyed: apply remote inserts/updates/deletes to the active trip,
  // skipping any change to an id we wrote within ECHO_MS (our optimistic state
  // is already correct — re-applying the echo would clobber a newer local edit
  // or jump the cursor).
  function handleRemote(change) {
    if (change.table === "trips" && change.trip) {
      setActive((a) => (a && a.id === change.trip.id ? { ...change.trip, entries: a.entries } : a));
      return;
    }
    const id = change.entry?.id || change.oldId;
    if (id && ownWrites.current[id] && Date.now() - ownWrites.current[id] < ECHO_MS) return;
    setActive((a) => {
      if (!a) return a;
      if (change.eventType === "DELETE") return { ...a, entries: a.entries.filter((e) => e.id !== id) };
      if (change.entry) return { ...a, entries: upsertLocal(a.entries, change.entry) };
      return a;
    });
  }

  // ── Enter / leave a trip ──────────────────────────────────────────────────
  async function enterTrip(id) {
    if (activeIdRef.current === id) return active;
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    activeIdRef.current = id;
    try {
      const trip = await fetchTrip(id);
      if (activeIdRef.current !== id) return null; // a later enterTrip won
      trip.entries = (trip.entries || []).slice().sort(byDayThenSort);
      setActive(trip);
      unsubRef.current = subscribeTrip(id, handleRemote);
      return trip;
    } catch (e) {
      console.error("enterTrip failed:", e.message);
      return null;
    }
  }
  function leaveTrip() {
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    activeIdRef.current = null;
    setActive(null);
  }

  // ── Writers ───────────────────────────────────────────────────────────────
  // Edit an existing entry — optimistic + debounced (mirrors queueCityWrite).
  function updateEntry(tripId, entry) {
    if (!entry.id) return; // new entries go through addEntry (need a server id)
    ownWrites.current[entry.id] = Date.now();
    setActive((a) => (a ? { ...a, entries: upsertLocal(a.entries, entry) } : a));
    entryPending.current[entry.id] = { ...(entryPending.current[entry.id] || {}), ...entry };
    clearTimeout(entryTimers.current[entry.id]);
    setSaveState({ status: "saving", at: Date.now() });
    entryTimers.current[entry.id] = setTimeout(() => {
      const patch = entryPending.current[entry.id];
      entryPending.current[entry.id] = null;
      Promise.resolve(upsertEntry(tripId, patch))
        .then((saved) => { ownWrites.current[saved.id] = Date.now(); setSaveState({ status: "saved", at: Date.now() }); })
        .catch((e) => { console.error(e.message); setSaveState({ status: "error", at: Date.now() }); });
    }, 600);
  }

  // Add a new entry (one-shot insert; adopts the server-generated id).
  async function addEntry(tripId, entry) {
    return flash(async () => {
      const saved = await upsertEntry(tripId, entry);
      ownWrites.current[saved.id] = Date.now();
      setActive((a) => (a ? { ...a, entries: [...a.entries, saved].sort(byDayThenSort) } : a));
      return saved;
    });
  }

  function removeEntry(entryId) {
    ownWrites.current[entryId] = Date.now();
    setActive((a) => (a ? { ...a, entries: a.entries.filter((e) => e.id !== entryId) } : a));
    flash(() => deleteEntry(entryId));
  }

  function reorder(tripId, day, ids) {
    const order = new Map(ids.map((id, i) => [id, i]));
    ids.forEach((id) => { ownWrites.current[id] = Date.now(); });
    setActive((a) => {
      if (!a) return a;
      const entries = a.entries.map((e) => (order.has(e.id) ? { ...e, sort: order.get(e.id) } : e)).sort(byDayThenSort);
      return { ...a, entries };
    });
    flash(() => reorderEntries(tripId, day, ids));
  }

  // Edit the trip frame (name/dates/legs/glance/travelers/passes) — debounced.
  function updateTripFrame(id, patch) {
    setActive((a) => (a && a.id === id ? { ...a, ...patch } : a));
    setTrips((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    tripPending.current[id] = { ...(tripPending.current[id] || {}), ...patch };
    clearTimeout(tripTimers.current[id]);
    setSaveState({ status: "saving", at: Date.now() });
    tripTimers.current[id] = setTimeout(() => {
      const p = tripPending.current[id];
      tripPending.current[id] = null;
      Promise.resolve(updateTrip(id, p))
        .then(() => setSaveState({ status: "saved", at: Date.now() }))
        .catch((e) => { console.error(e.message); setSaveState({ status: "error", at: Date.now() }); });
    }, 600);
  }

  async function createTrip(frame) {
    return flash(async () => {
      const t = await insertTrip({ userId, ...frame });
      setTrips((ts) => [...ts, t]);
      return t;
    });
  }
  function removeTrip(id) {
    setTrips((ts) => ts.filter((t) => t.id !== id));
    if (activeIdRef.current === id) leaveTrip();
    flash(() => deleteTrip(id));
  }

  const value = useMemo(() => ({
    trips, active, hydrated, saveState,
    enterTrip, leaveTrip,
    createTrip, updateTripFrame, removeTrip,
    addEntry, updateEntry, removeEntry, reorder,
  }), [trips, active, hydrated, saveState]);

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

function useTripContext() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error("useTrips/useTrip must be used inside <TripProvider>");
  return ctx;
}
export const useTrips = () => useTripContext();
export const useActiveTrip = () => useTripContext().active;
export const useTripEntries = () => useTripContext().active?.entries || [];
