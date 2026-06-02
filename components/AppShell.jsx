"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { STAGES, citySlug, cityStage } from "../lib/planner-data";
import { usePlanner } from "./PlannerProvider";

// Top-nav workflow modes. The home is "Board" (the kanban overview); the
// others are purpose-built workspaces. Stage IDs from STAGES are still used
// for city metadata (badges, context strip color), but the nav is workflow,
// not a stage filter.
const NAV_MODES = [
  { id: "board",     href: "/board",     label: "Board",     help: "Kanban view of where every candidate stands.", stageId: null },
  { id: "calibrate", href: "/calibrate", label: "Ranking",   help: "Sortable table of candidates ranked by measured fit.", stageId: "calibrate" },
  { id: "visit",     href: "/visit",     label: "Visit",     help: "Trips you've planned or are on.", stageId: "visit" },
  { id: "decide",    href: "/decide",    label: "Decide",    help: "Cities back from a trip, awaiting their survey.", stageId: "decide" },
  { id: "decided",   href: "/decided",   label: "Decided",   help: "Archive of verdicts you've made.", stageId: "decided" },
  { id: "baseline",  href: "/baseline",  label: "Baseline",  help: "Rate places you already know — the calibration answer key.", stageId: null },
];

// Used by city context strip to know which workflow mode owns each stage.
const STAGE_TO_MODE = {
  shortlist: "board",
  calibrate: "calibrate",
  visit:     "visit",
  decide:    "decide",
  decided:   "decided",
};

const MODE_HREF = Object.fromEntries(NAV_MODES.map((mode) => [mode.id, mode.href]));

// Which workflow-mode tab should light up when you're looking at a specific
// city? The mode whose stage the city is currently sitting in. Used by the
// Detail / Images routes (Visit / Decide override with a fixed mode).
export function modeForCity(cityItem) {
  if (!cityItem) return "board";
  return STAGE_TO_MODE[cityStage(cityItem)] || "board";
}

/**
 * AppShell — the new global layout.
 *
 * One full-width canvas, a top bar that always tells you which stage of the
 * funnel you're in, and a slim city-context strip when you've drilled into a
 * specific candidate. The persistent sidebar from the old design is gone:
 * navigation now flows through the stage switcher and ⌘K (future) instead of
 * a left rail competing with the workspace for room.
 */
// `activeMode` is the new top-nav prop ("board" | "calibrate" | "visit" |
// "decide" | "decided"). We still accept the older `activeStage` name from
// existing callers and treat it the same way.
export default function AppShell({ activeMode, activeStage, cityItem, cityNav, children }) {
  const mode = activeMode || activeStage;
  return (
    <div className="shell">
      <TopBar activeMode={mode} />
      {cityItem ? <CityContextStrip cityItem={cityItem} cityNav={cityNav} /> : null}
      <main className={`canvas${cityItem ? " has-context" : ""}`}>{children}</main>
    </div>
  );
}

function TopBar({ activeMode }) {
  const { exportPlanner, replacePlanner, saveState, hydrated } = usePlanner();

  return (
    <header className="topbar-v2">
      <div className="topbar-brand">
        <Link href="/board" className="brand-mark">
          <span className="brand-dot" aria-hidden="true" />
          <span>Livability Scout</span>
        </Link>
        <SavePill saveState={saveState} hydrated={hydrated} />
      </div>

      <nav className="stage-nav" aria-label="Workflow modes">
        {NAV_MODES.map((mode) => {
          const active = mode.id === activeMode;
          const stageClass = mode.stageId ? `stage-${mode.stageId}` : "stage-board";
          return (
            <Link
              key={mode.id}
              href={mode.href}
              className={`stage-tab ${stageClass}${active ? " active" : ""}`}
              title={mode.help}
            >
              <span className="stage-tab-label">{mode.label}</span>
            </Link>
          );
        })}
      </nav>

      <BackupMenu
        onExport={() => {
          const blob = new Blob([exportPlanner()], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "livability-scout-planner.json";
          link.click();
          URL.revokeObjectURL(url);
        }}
        onImport={(file) => {
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            try {
              replacePlanner(JSON.parse(String(reader.result || "")));
            } catch (error) {
              window.alert(error.message || "Could not read planner file.");
            }
          };
          reader.readAsText(file);
        }}
      />
    </header>
  );
}

function SavePill({ saveState, hydrated }) {
  const [, force] = useState(0);
  // Re-render every 30s so "saved 2m ago" stays accurate without polling.
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);
  if (!hydrated) return <span className="save-pill saving">loading</span>;
  if (saveState.status === "saving") return <span className="save-pill saving">saving…</span>;
  // Nothing saved yet this session (at===0) → just "synced", no bogus age.
  if (!saveState.at) return <span className="save-pill saved" title="Synced with the cloud">synced</span>;
  const ago = Math.max(0, Math.round((Date.now() - saveState.at) / 1000));
  const label = ago < 5 ? "saved" : ago < 60 ? `saved ${ago}s ago` : `saved ${Math.round(ago / 60)}m ago`;
  return <span className="save-pill saved" title="Saved to the cloud">{label}</span>;
}

function BackupMenu({ onExport, onImport }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`backup-menu${open ? " open" : ""}`}>
      <button type="button" className="backup-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        ⋯
      </button>
      {open ? (
        <div className="backup-pop" role="menu" onMouseLeave={() => setOpen(false)}>
          <button type="button" onClick={() => { setOpen(false); onExport(); }}>Download backup</button>
          <label className="backup-import">
            Restore from file
            <input type="file" accept="application/json" onChange={(event) => { setOpen(false); onImport(event.target.files?.[0]); }} />
          </label>
        </div>
      ) : null}
    </div>
  );
}

function CityContextStrip({ cityItem, cityNav }) {
  const stage = cityStage(cityItem);
  const stageLabel = STAGES.find((entry) => entry.id === stage)?.label || stage;
  return (
    <div className={`city-context stage-${stage}`}>
      <div className="city-context-left">
        <Link href={MODE_HREF[STAGE_TO_MODE[stage]] || "/board"} className="city-context-back">←</Link>
        <div className="city-context-text">
          <span className="city-context-stage">{stageLabel}</span>
          <strong>{cityItem.name}</strong>
        </div>
      </div>
      {cityNav?.length ? (
        <nav className="city-context-nav">
          {cityNav.map((item) => (
            <Link key={item.href} href={item.href} className={`city-context-tab${item.active ? " active" : ""}`}>
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

export function defaultCityNav(cityItem, activeMode) {
  const slug = citySlug(cityItem);
  return [
    { href: `/cities/${slug}`, label: "Detail", active: activeMode === "detail" },
    { href: `/cities/${slug}/visit`, label: "Visit", active: activeMode === "visit" },
    { href: `/cities/${slug}/images`, label: "Images", active: activeMode === "images" },
    { href: `/cities/${slug}/decide`, label: "Decide", active: activeMode === "decide" },
  ];
}
