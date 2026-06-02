"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  averageScore,
  city,
  cityStage,
  citySlug,
  defaultWeights,
  emptySurvey,
  matrixDimensions,
  normalizeMatrix,
} from "../lib/planner-data";
import {
  fetchCities, insertCity, saveCityFields,
  fetchMySurveys, upsertSurvey,
  fetchMyBaselines, upsertBaseline,
  fetchMyWeights, upsertWeights,
} from "../lib/db";
import { useAuth } from "./AuthGate";

const PlannerContext = createContext(null);

export function PlannerProvider({ children, initialManifest }) {
  const { userId } = useAuth();
  const [planner, setPlanner] = useState({ cities: [], selectedId: null });
  const [imageState, setImageState] = useState(() => initialManifest);
  const [weights, setWeightsState] = useState(() => defaultWeights());
  const [references, setReferences] = useState({});
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState({ status: "idle", at: 0 });

  // Debounced city-field writers, one timer per city id.
  const cityTimers = useRef({});
  const cityPending = useRef({});

  // ── Load everything for this user on mount ────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const [cities, mySurveys, myBaselines, myWeights] = await Promise.all([
          fetchCities(), fetchMySurveys(userId), fetchMyBaselines(userId), fetchMyWeights(userId),
        ]);
        if (cancelled) return;
        // Merge this user's survey onto each shared city.
        const merged = cities.map((c) => ({ ...c, survey: mySurveys[c.id] || emptySurvey() }));
        setPlanner({ cities: merged, selectedId: merged[0]?.id || null });
        setReferences(myBaselines || {});
        if (myWeights) setWeightsState({ ...defaultWeights(), ...myWeights });
      } catch (e) {
        console.error("Load failed:", e.message);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  function flash(run) {
    setSaveState({ status: "saving", at: Date.now() });
    Promise.resolve(run())
      .then(() => setSaveState({ status: "saved", at: Date.now() }))
      .catch((e) => { console.error(e.message); setSaveState({ status: "error", at: Date.now() }); });
  }

  // Debounced flush of accumulated shared-city field edits.
  function queueCityWrite(cityId, patch) {
    cityPending.current[cityId] = { ...(cityPending.current[cityId] || {}), ...patch };
    clearTimeout(cityTimers.current[cityId]);
    setSaveState({ status: "saving", at: Date.now() });
    cityTimers.current[cityId] = setTimeout(() => {
      const pending = cityPending.current[cityId];
      cityPending.current[cityId] = null;
      Promise.resolve(saveCityFields(cityId, pending))
        .then(() => setSaveState({ status: "saved", at: Date.now() }))
        .catch((e) => { console.error(e.message); setSaveState({ status: "error", at: Date.now() }); });
    }, 600);
  }

  const value = useMemo(() => ({
    planner,
    hydrated,
    imageState,
    setImageState,
    weights,
    saveState,
    references,

    setReferenceSurvey(placeName, survey) {
      setReferences((current) => ({ ...current, [placeName]: survey }));
      if (userId) flash(() => upsertBaseline(userId, placeName, survey));
    },

    setWeight(key, nextValue) {
      setWeightsState((current) => {
        const next = { ...current, [key]: Math.max(0, Number(nextValue) || 0) };
        if (userId) {
          clearTimeout(cityTimers.current.__weights);
          cityTimers.current.__weights = setTimeout(() => flash(() => upsertWeights(userId, next)), 500);
        }
        return next;
      });
    },
    resetWeights() {
      const next = defaultWeights();
      setWeightsState(next);
      if (userId) flash(() => upsertWeights(userId, next));
    },

    advanceCityStage(cityId) {
      setPlanner((current) => {
        const cities = current.cities.map((item) => {
          if (item.id !== cityId) return item;
          const advanced = advanceStage(item);
          queueCityWrite(cityId, { status: advanced.status, decision: advanced.decision });
          return advanced;
        });
        return { ...current, cities };
      });
    },
    setCityStage(cityId, stageId) {
      setPlanner((current) => {
        const cities = current.cities.map((item) => {
          if (item.id !== cityId) return item;
          const staged = applyStage(item, stageId);
          queueCityWrite(cityId, { status: staged.status, decision: staged.decision });
          return staged;
        });
        return { ...current, cities };
      });
    },

    benchmarks: [],

    updateCity(cityId, patch) {
      // Split per-user survey from shared city fields.
      const { survey, ...cityPatch } = patch;
      setPlanner((current) => ({
        ...current,
        cities: current.cities.map((item) => item.id === cityId ? { ...item, ...patch } : item),
      }));
      if (survey !== undefined && userId) flash(() => upsertSurvey(cityId, userId, survey));
      if (Object.keys(cityPatch).length) queueCityWrite(cityId, cityPatch);
    },

    updateCityWith(cityId, updater) {
      setPlanner((current) => {
        const cities = current.cities.map((item) => {
          if (item.id !== cityId) return item;
          const next = updater(item);
          const { survey, ...rest } = next;
          queueCityWrite(cityId, mapWritable(rest));
          return next;
        });
        return { ...current, cities };
      });
    },

    replacePlanner() { /* import disabled in multi-user DB mode */ },
    resetPlanner() { /* reset disabled in shared DB mode */ },

    async addCity() {
      const draft = city("New city", "", "", "", "", "", "", []);
      let saved = draft;
      try {
        saved = await insertCity(draft);
      } catch (e) { console.error("addCity:", e.message); }
      const withSurvey = { ...saved, survey: emptySurvey() };
      setPlanner((current) => ({ ...current, cities: [withSurvey, ...current.cities], selectedId: withSurvey.id }));
      return withSurvey;
    },

    moveCity(cityId, direction) {
      // Local-only reorder (display order isn't persisted in this version).
      setPlanner((current) => {
        const index = current.cities.findIndex((item) => item.id === cityId);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= current.cities.length) return current;
        const cities = [...current.cities];
        const [moved] = cities.splice(index, 1);
        cities.splice(nextIndex, 0, moved);
        return { ...current, cities };
      });
    },

    applySavedImage(query, payload) {
      setImageState((current) => ({
        images: { ...current.images, ...(payload.manifestSrc ? { [query]: payload.manifestSrc } : {}) },
        choices: { ...current.choices, ...(payload.choices ? { [query]: payload.choices } : {}) },
        version: (current.version || 0) + 1,
      }));
    },

    exportPlanner() {
      return JSON.stringify(planner, null, 2);
    },
  }), [planner, imageState, weights, references, saveState, hydrated, userId]);

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

// Whitelist the shared fields updateCityWith may persist (drops transient keys).
function mapWritable(obj) {
  const allow = ["name","stayZone","stayZoneBoundary","heartIntersection","tripWeek","why","ifWins","ifFails","blocks","status","decision","heroImage","arriveDate","departDate","tripLength","flightDetails","carDetails","lodgingDetails","logisticsNotes","days","checklists","matrix","measured","measuredMetrics","visitClimate","crowdSeason","seasonNotes"];
  const out = {};
  for (const k of allow) if (k in obj) out[k] = obj[k];
  return out;
}

export function usePlanner() {
  const value = useContext(PlannerContext);
  if (!value) throw new Error("Planner context is missing.");
  return value;
}

export function usePlannerCity(slug) {
  const { planner } = usePlanner();
  return planner.cities.find((item) => citySlug(item) === slug) || null;
}

// Stage transitions translate "advance / set stage" into concrete fields.
function applyStage(cityItem, stageId) {
  switch (stageId) {
    case "shortlist": return { ...cityItem, status: "Idea", decision: "Undecided" };
    case "calibrate": return { ...cityItem, status: "Shortlist", decision: "Undecided" };
    case "visit":     return { ...cityItem, status: "Scheduled", decision: "Undecided" };
    case "decide":    return { ...cityItem, status: "Visited", decision: "Undecided" };
    case "decided":   return { ...cityItem, status: "Visited", decision: cityItem.decision === "Undecided" ? "Advance" : cityItem.decision };
    default:          return cityItem;
  }
}
function advanceStage(cityItem) {
  const order = ["shortlist", "calibrate", "visit", "decide", "decided"];
  const current = cityStage(cityItem);
  const next = order[Math.min(order.length - 1, order.indexOf(current) + 1)];
  return applyStage(cityItem, next);
}

export function plannerStats(cities) {
  const scheduled = cities.filter((c) => c.arriveDate || (c.tripWeek && c.tripWeek !== "Unscheduled")).length;
  const visited = cities.filter((c) => c.status === "Visited").length;
  const advanced = cities.filter((c) => c.decision === "Advance").length;
  return { scheduled, visited, advanced };
}

export function sortedScore(cityItem) {
  return averageScore(normalizeMatrix(cityItem.matrix, cityItem.name)).toFixed(1);
}

export function imageChoicesFor(token, query, imageState) {
  const lookup = token?.replace("commons-search:", "") || query;
  const choices = normalizeChoiceList(imageState.choices[lookup] || imageState.choices[query]);
  const current = resolveImage(token, query, imageState);
  const manifest = manifestSrc(imageState.images[lookup]) || manifestSrc(imageState.images[query]);
  const merged = [...choices];
  [current, manifest].forEach((src) => {
    if (src && !merged.some((choice) => choice.src === src)) merged.unshift({ src, title: "Current image" });
  });
  return merged;
}

export function resolveImage(token, query, imageState) {
  const isDirectImage = token && !token.startsWith("commons-search:");
  const lookup = token?.replace("commons-search:", "") || query;
  if (isDirectImage && token.startsWith("/assets/")) return token;
  if (isDirectImage && /^https?:\/\//.test(token)) return token;
  return manifestSrc(imageState.images[lookup]) || manifestSrc(imageState.images[query]) || firstChoiceSrc(lookup, imageState) || firstChoiceSrc(query, imageState) || "";
}

export function appendBust(src, version) {
  if (!src || !version) return src || "";
  if (src.startsWith("data:")) return src;
  if (/^https?:\/\//.test(src)) return src;
  const sep = src.includes("?") ? "&" : "?";
  return `${src}${sep}v=${version}`;
}

function normalizeChoiceList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item) => item?.src);
  return value.src ? [value] : [];
}
function firstChoiceSrc(key, imageState) {
  return normalizeChoiceList(imageState.choices[key])[0]?.src || "";
}
function manifestSrc(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0]?.src || value[0] || "";
  return value.src || "";
}
