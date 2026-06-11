"use client";

// TripProvider (issue #12) — the Trip Planner's context, parallel to
// PlannerProvider. Loads the user's trips, the active trip's entries, exposes
// selectors + debounced writers, and merges real-time changes. Supabase is the
// system of record (no localStorage, no seed maps). Components never call
// getSupabase() — everything funnels through lib/db.js.
//
// Real-time merge = the strategy decided in features/trip-realtime-merge.md
// (#36): per-entry LWW with timestamp-guarded own-echo suppression. We keep a
// `pendingEntries` map of in-flight writes and ignore an incoming change that is
// our own echo (same id, not newer than what we sent) so the cursor never jumps.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  fetchMyTrips,
  fetchTrip,
  insertTrip,
  updateTrip as dbUpdateTrip,
  deleteTrip as dbDeleteTrip,
  upsertEntry as dbUpsertEntry,
  deleteEntry as dbDeleteEntry,
  reorderEntries as dbReorderEntries,
  subscribeTrip,
} from "../lib/db";
import { useAuth } from "./AuthGate";

const TripContext = createContext(null);

export function TripProvider({ children }) {
  const auth = useAuth();
  const userId = auth?.userId || null;

  const [trips, setTrips] = useState([]);
  const [active, setActive] = useState(null); // { trip, entries } | null
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState({ status: "idle", at: 0 });

  // Debounce timers + accumulated patches. One trip-frame timer; one timer per
  // entry id (so editing the balloon's note doesn't flush lunch).
  const tripTimer = useRef(null);
  const tripPending = useRef({});
  const entryTimers = useRef({});
  const entryPending = useRef({});
  // Own-echo suppression: id -> last local write time (ms).
  const pendingEntries = useRef(new Map());
  const unsub = useRef(null);

  const flash = useCallback((run) => {
    setSaveState({ status: "saving", at: Date.now() });
    Promise.resolve(run())
      .then(() => setSaveState({ status: "saved", at: Date.now() }))
      .catch((e) => {
        console.error(e.message);
        setSaveState({ status: "error", at: Date.now() });
      });
  }, []);

  // ── Load this user's trips on mount ───────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const mine = await fetchMyTrips(userId);
        if (!cancelled) setTrips(mine);
      } catch (e) {
        console.error("Trips load failed:", e.message);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // ── Open a trip: hydrate entries + subscribe to real-time ─────────────────
  const enterTrip = useCallback((id) => {
    if (unsub.current) {
      unsub.current();
      unsub.current = null;
    }
    let cancelled = false;
    (async () => {
      try {
        const trip = await fetchTrip(id);
        if (cancelled) return;
        setActive({ trip, entries: trip.entries || [] });
        unsub.current = subscribeTrip(id, (change) => {
          // Own-echo suppression (#36): skip a change we caused.
          if (change.table === "trip_entries" && change.id) {
            const sentAt = pendingEntries.current.get(change.id);
            if (sentAt && change.eventType !== "DELETE") return; // our in-flight write echoing back
          }
          setActive((cur) => {
            if (!cur || cur.trip.id !== id) return cur;
            if (change.table === "trips" && change.trip) {
              return { ...cur, trip: { ...change.trip, entries: cur.entries } };
            }
            if (change.table === "trip_entries") {
              if (change.eventType === "DELETE") {
                return { ...cur, entries: cur.entries.filter((e) => e.id !== change.id) };
              }
              const e = change.entry;
              if (!e) return cur;
              const i = cur.entries.findIndex((x) => x.id === e.id);
              const entries =
                i === -1 ? [...cur.entries, e] : cur.entries.map((x) => (x.id === e.id ? e : x));
              return { ...cur, entries };
            }
            return cur;
          });
        });
      } catch (e) {
        console.error("Open trip failed:", e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const leaveTrip = useCallback(() => {
    if (unsub.current) {
      unsub.current();
      unsub.current = null;
    }
    setActive(null);
  }, []);

  useEffect(() => () => unsub.current?.(), []); // cleanup on unmount

  // ── Debounced trip-frame writer ───────────────────────────────────────────
  const updateTrip = useCallback(
    (id, patch) => {
      setActive((cur) =>
        cur && cur.trip.id === id ? { ...cur, trip: { ...cur.trip, ...patch } } : cur
      );
      setTrips((cur) => cur.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      tripPending.current = { ...tripPending.current, ...patch };
      clearTimeout(tripTimer.current);
      setSaveState({ status: "saving", at: Date.now() });
      tripTimer.current = setTimeout(() => {
        const pending = tripPending.current;
        tripPending.current = {};
        flash(() => dbUpdateTrip(id, pending));
      }, 600);
    },
    [flash]
  );

  // ── Debounced per-entry writer (accumulates partial patches per id) ───────
  const updateEntry = useCallback((tripId, entry) => {
    setActive((cur) => {
      if (!cur || cur.trip.id !== tripId) return cur;
      const i = cur.entries.findIndex((e) => e.id === entry.id);
      const entries =
        i === -1
          ? [...cur.entries, entry]
          : cur.entries.map((e) => (e.id === entry.id ? { ...e, ...entry } : e));
      return { ...cur, entries };
    });
    const id = entry.id;
    entryPending.current[id] = { ...(entryPending.current[id] || {}), ...entry };
    clearTimeout(entryTimers.current[id]);
    setSaveState({ status: "saving", at: Date.now() });
    entryTimers.current[id] = setTimeout(() => {
      const merged = entryPending.current[id];
      entryPending.current[id] = null;
      pendingEntries.current.set(id, Date.now());
      Promise.resolve(dbUpsertEntry(tripId, merged))
        .then((saved) => {
          // Reconcile the server id (for a fresh entry) and clear the echo guard.
          if (saved?.id) {
            pendingEntries.current.set(saved.id, Date.now());
            setActive((cur) =>
              cur && cur.trip.id === tripId
                ? {
                    ...cur,
                    entries: cur.entries.map((e) => (e.id === id ? { ...e, ...saved } : e)),
                  }
                : cur
            );
          }
          setSaveState({ status: "saved", at: Date.now() });
          setTimeout(() => pendingEntries.current.delete(saved?.id || id), 1500);
        })
        .catch((e) => {
          console.error(e.message);
          setSaveState({ status: "error", at: Date.now() });
        });
    }, 600);
  }, []);

  const removeEntry = useCallback(
    (tripId, entryId) => {
      setActive((cur) =>
        cur && cur.trip.id === tripId
          ? { ...cur, entries: cur.entries.filter((e) => e.id !== entryId) }
          : cur
      );
      flash(() => dbDeleteEntry(entryId));
    },
    [flash]
  );

  const reorderDay = useCallback(
    (tripId, day, ids) => {
      setActive((cur) => {
        if (!cur || cur.trip.id !== tripId) return cur;
        const order = new Map(ids.map((id, i) => [id, i]));
        const entries = cur.entries.map((e) =>
          order.has(e.id) ? { ...e, sort: order.get(e.id) } : e
        );
        return { ...cur, entries };
      });
      ids.forEach((id) => pendingEntries.current.set(id, Date.now()));
      flash(() => dbReorderEntries(tripId, day, ids));
    },
    [flash]
  );

  const createTrip = useCallback(
    async (draft) => {
      const saved = await insertTrip({ userId, ...draft });
      setTrips((cur) => [...cur, saved]);
      return saved;
    },
    [userId]
  );

  const removeTrip = useCallback(
    (id) => {
      setTrips((cur) => cur.filter((t) => t.id !== id));
      flash(() => dbDeleteTrip(id));
    },
    [flash]
  );

  const value = useMemo(
    () => ({
      trips,
      active,
      hydrated,
      saveState,
      enterTrip,
      leaveTrip,
      updateTrip,
      updateEntry,
      removeEntry,
      reorderDay,
      createTrip,
      removeTrip,
    }),
    [
      trips,
      active,
      hydrated,
      saveState,
      enterTrip,
      leaveTrip,
      updateTrip,
      updateEntry,
      removeEntry,
      reorderDay,
      createTrip,
      removeTrip,
    ]
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrips() {
  const v = useContext(TripContext);
  if (!v) throw new Error("TripProvider is missing.");
  return v;
}

// The active (open) trip + its entries, or null.
export function useTrip(id) {
  const v = useTrips();
  useEffect(() => {
    if (id) v.enterTrip(id);
    return () => v.leaveTrip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return v.active && v.active.trip.id === id ? v.active : null;
}

export function useTripEntries(id) {
  const t = useTrip(id);
  return t?.entries || [];
}
