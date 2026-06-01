"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  STORAGE_KEY,
  averageScore,
  city,
  cityStage,
  citySlug,
  defaultState,
  defaultWeights,
  matrixDimensions,
  normalizeMatrix,
  normalizeState,
  normalizeWeights,
  starterCities,
} from "../lib/planner-data";

const WEIGHTS_KEY = `${STORAGE_KEY}::weights`;
const REFERENCES_KEY = `${STORAGE_KEY}::references`;

const PlannerContext = createContext(null);

export function PlannerProvider({ children, initialManifest }) {
  const [planner, setPlanner] = useState(() => defaultState());
  const [imageState, setImageState] = useState(() => initialManifest);
  const [weights, setWeightsState] = useState(() => defaultWeights());
  // Baseline reference surveys: { [placeName]: survey }. Calibration anchors.
  const [references, setReferences] = useState(() => ({}));
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState({ status: "idle", at: 0 });

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.cities) && parsed.cities.length) {
          setPlanner(normalizeState(parsed));
        }
      }
      const savedWeights = window.localStorage.getItem(WEIGHTS_KEY);
      if (savedWeights) setWeightsState(normalizeWeights(JSON.parse(savedWeights)));
      const savedRefs = window.localStorage.getItem(REFERENCES_KEY);
      if (savedRefs) setReferences(JSON.parse(savedRefs) || {});
    } catch {
      setPlanner(defaultState());
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setSaveState({ status: "saving", at: Date.now() });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(planner));
    const timer = setTimeout(() => setSaveState({ status: "saved", at: Date.now() }), 200);
    return () => clearTimeout(timer);
  }, [planner, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(WEIGHTS_KEY, JSON.stringify(weights));
  }, [weights, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(REFERENCES_KEY, JSON.stringify(references));
  }, [references, hydrated]);

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
    },
    setWeight(key, nextValue) {
      setWeightsState((current) => ({ ...current, [key]: Math.max(0, Number(nextValue) || 0) }));
    },
    resetWeights() {
      setWeightsState(defaultWeights());
    },
    advanceCityStage(cityId) {
      setPlanner((current) => ({
        ...current,
        cities: current.cities.map((item) => item.id === cityId ? advanceStage(item) : item),
      }));
    },
    setCityStage(cityId, stageId) {
      setPlanner((current) => ({
        ...current,
        cities: current.cities.map((item) => item.id === cityId ? applyStage(item, stageId) : item),
      }));
    },
    benchmarks: [],
    updateCity(cityId, patch) {
      setPlanner((current) => ({
        ...current,
        cities: current.cities.map((item) => item.id === cityId ? { ...item, ...patch } : item),
      }));
    },
    updateCityWith(cityId, updater) {
      setPlanner((current) => ({
        ...current,
        cities: current.cities.map((item) => item.id === cityId ? updater(item) : item),
      }));
    },
    replacePlanner(next) {
      setPlanner(normalizeState(next));
    },
    resetPlanner() {
      setPlanner(defaultState());
    },
    addCity() {
      const next = city("New city", "", "", "", "", "", "", []);
      setPlanner((current) => ({
        ...current,
        cities: [next, ...current.cities],
        selectedId: next.id,
      }));
      return next;
    },
    moveCity(cityId, direction) {
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
      // Bump the global version counter on every save so any rendered <img>
      // that appends ?v={imageState.version} (Board cards, City Detail hero,
      // Images preview) immediately refetches. The bytes on disk change but
      // the URL path stays the same — without the version bump browsers
      // serve a cached stale image.
      setImageState((current) => ({
        images: {
          ...current.images,
          ...(payload.manifestSrc ? { [query]: payload.manifestSrc } : {}),
        },
        choices: {
          ...current.choices,
          ...(payload.choices ? { [query]: payload.choices } : {}),
        },
        version: (current.version || 0) + 1,
      }));
    },
    exportPlanner() {
      return JSON.stringify(planner, null, 2);
    },
  }), [planner, imageState, weights, references, saveState, hydrated]);

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
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

// Stage transitions translate user intent ("advance this card") into the
// concrete status/decision fields the data model uses. Keeping the mapping
// here means the rest of the app only thinks in stages.
function applyStage(cityItem, stageId) {
  switch (stageId) {
    case "shortlist":
      return { ...cityItem, status: "Idea", decision: "Undecided" };
    case "calibrate":
      return { ...cityItem, status: "Shortlist", decision: "Undecided" };
    case "visit":
      return { ...cityItem, status: "Scheduled", decision: "Undecided" };
    case "decide":
      return { ...cityItem, status: "Visited", decision: "Undecided" };
    case "decided":
      return { ...cityItem, status: "Visited", decision: cityItem.decision === "Undecided" ? "Advance" : cityItem.decision };
    default:
      return cityItem;
  }
}

function advanceStage(cityItem) {
  const order = ["shortlist", "calibrate", "visit", "decide", "decided"];
  const current = cityStage(cityItem);
  const next = order[Math.min(order.length - 1, order.indexOf(current) + 1)];
  return applyStage(cityItem, next);
}

export function plannerStats(cities) {
  const scheduled = cities.filter((cityItem) => cityItem.arriveDate || (cityItem.tripWeek && cityItem.tripWeek !== "Unscheduled")).length;
  const visited = cities.filter((cityItem) => cityItem.status === "Visited").length;
  const advanced = cities.filter((cityItem) => cityItem.decision === "Advance").length;
  return { scheduled, visited, advanced };
}

export function sortedScore(cityItem) {
  const scores = normalizeMatrix(cityItem.matrix, cityItem.name);
  return averageScore(scores).toFixed(1);
}

export function resolveImage(token, query, imageState) {
  // External http(s) URLs win immediately — those are user-pasted live URLs.
  if (token && /^https?:\/\//.test(token) && !token.startsWith("commons-search:")) return token;
  // Always consult the manifest first via the canonical query key — that's
  // the source of truth. cityItem.heroImage may still hold a stale direct
  // path from before a migration; checking the manifest avoids broken
  // images when filenames change underneath the stored token.
  const fromManifest = manifestSrc(imageState.images[query]);
  if (fromManifest) return fromManifest;
  // Fallback to the token if it's a direct /assets/ path that still exists.
  if (token && token.startsWith("/assets/")) return token;
  return "";
}

// Append the global cache-bust version so the browser refetches images
// after a save even when the file URL is unchanged on disk. No-op for data:
// URLs and remote http(s) sources.
export function appendBust(src, version) {
  if (!src || !version) return src || "";
  if (src.startsWith("data:")) return src;
  if (/^https?:\/\//.test(src)) return src;
  const sep = src.includes("?") ? "&" : "?";
  return `${src}${sep}v=${version}`;
}

function manifestSrc(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.src || "";
}
