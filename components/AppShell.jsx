"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { STAGES, citySlug, cityStage } from "../lib/planner-data";
import { usePlanner } from "./PlannerProvider";

// Top-nav workflow modes. The home is "Board" (every candidate by stage);
// "Ranking" is a view toggle on the Board page, not a separate tab. The other
// tabs are the purpose-built stage workspaces. Stage IDs from STAGES drive the
// city metadata (badges, context strip color).
const NAV_MODES = [
  { id: "board",    href: "/board",    label: "Board",    help: "Every candidate, by stage.", stageId: null },
  { id: "planning", href: "/planning", label: "Planning", help: "Rank candidates and plan each trip's best week.", stageId: "planning" },
  { id: "planned",  href: "/planned",  label: "Planned",  help: "Trips with committed dates.", stageId: "planned" },
  { id: "visited",  href: "/visited",  label: "Visited",  help: "Back from a trip, awaiting the survey.", stageId: "visited" },
  { id: "assessed", href: "/assessed", label: "Assessed", help: "Archive of verdicts you've made.", stageId: "assessed" },
  { id: "baseline", href: "/baseline", label: "Baseline", help: "Rate places you already know — the answer key.", stageId: null },
];

// Used by city context strip to know which workflow mode owns each stage.
// Backlog has no dedicated workspace — it lives on the Board.
const STAGE_TO_MODE = {
  backlog:  "board",
  planning: "planning",
  planned:  "planned",
  visited:  "visited",
  assessed: "assessed",
};

const MODE_HREF = Object.fromEntries(NAV_MODES.map((mode) => [mode.id, mode.href]));

// Horizontally scroll a tab row so its active tab is centered/in view. Uses
// getBoundingClientRect deltas (robust to offsetParent) and only adjusts the
// container's own scrollLeft, so the page never scrolls. No-op if the row
// isn't actually overflowing (e.g. when it fits full-width on a phone).
function scrollActiveTabIntoView(nav, activeSelector) {
  const active = nav?.querySelector(activeSelector);
  if (!nav || !active) return;
  // If everything fits, make sure we're parked at the start — otherwise a
  // scrollLeft left over from an earlier (narrower) render clips the first tab.
  if (nav.scrollWidth <= nav.clientWidth + 1) { nav.scrollLeft = 0; return; }
  const navRect = nav.getBoundingClientRect();
  const tabRect = active.getBoundingClientRect();
  const delta = (tabRect.left - navRect.left) - (nav.clientWidth - tabRect.width) / 2;
  nav.scrollLeft += delta;
}

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
// `activeMode` is the top-nav prop ("board" | "planning" | "planned" |
// "visited" | "assessed" | "baseline"). We still accept the older
// `activeStage` name from existing callers and treat it the same way.
export default function AppShell({ activeMode, activeStage, cityItem, cityNav, children }) {
  const mode = activeMode || activeStage;
  return (
    <div className="shell">
      {/* `has-city` lets the mobile CSS collapse the redundant global funnel on
          city pages (the context strip's back-arrow handles upward nav). */}
      <div className={`sticky-header${cityItem ? " has-city" : ""}`}>
        <TopBar activeMode={mode} />
        {cityItem ? <CityContextStrip cityItem={cityItem} cityNav={cityNav} /> : null}
      </div>
      <main className={`canvas${cityItem ? " has-context" : ""}`}>{children}</main>
    </div>
  );
}

function TopBar({ activeMode }) {
  const { exportPlanner, replacePlanner, saveState, hydrated } = usePlanner();
  const navRef = useRef(null);

  // On a phone the tab row scrolls horizontally; keep the active stage centered
  // and in view rather than clipped off the right edge. Uses live rects (not
  // offsetLeft, which is relative to the offsetParent and mis-scrolls) and only
  // nudges the container's scrollLeft, so the window never moves.
  // (Phase 1/5, features/mobile.md)
  useEffect(() => {
    scrollActiveTabIntoView(navRef.current, ".stage-tab.active");
  }, [activeMode]);

  return (
    <header className="topbar-v2">
      <div className="topbar-brand">
        <Link href="/board" className="brand-mark">
          <span className="brand-dot" aria-hidden="true" />
          <span>Livability Scout</span>
        </Link>
        <SavePill saveState={saveState} hydrated={hydrated} />
      </div>

      <nav className="stage-nav" aria-label="Workflow modes" ref={navRef}>
        {NAV_MODES.map((mode) => {
          const active = mode.id === activeMode;
          const stageClass = mode.stageId ? `stage-${mode.stageId}` : "stage-board";
          return (
            <Link
              key={mode.id}
              href={mode.href}
              className={`stage-tab ${stageClass}${active ? " active" : ""}`}
              title={mode.help}
              aria-current={active ? "page" : undefined}
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
  const { updateCity } = usePlanner();
  const stage = cityStage(cityItem);
  const stageLabel = STAGES.find((entry) => entry.id === stage)?.label || stage;
  const navRef = useRef(null);

  // Keep the active sub-tab (Detail/Plan/Images/Assess) centered when the row
  // scrolls horizontally on a phone. (Phase 1/5, features/mobile.md)
  useEffect(() => {
    scrollActiveTabIntoView(navRef.current, ".city-context-tab.active");
  }, [cityNav]);

  return (
    <div className={`city-context stage-${stage}`}>
      <div className="city-context-left">
        <Link href={MODE_HREF[STAGE_TO_MODE[stage]] || "/board"} className="city-context-back">←</Link>
        <div className="city-context-text">
          <span className="city-context-stage">{stageLabel}</span>
          <input
            className="city-context-name"
            value={cityItem.name}
            onChange={(event) => updateCity(cityItem.id, { name: event.target.value })}
            aria-label="City name"
          />
        </div>
      </div>
      {cityNav?.length ? (
        <nav className="city-context-nav" ref={navRef}>
          {cityNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`city-context-tab${item.active ? " active" : ""}`}
              aria-current={item.active ? "page" : undefined}
            >
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
    { href: `/cities/${slug}/plan`, label: "Plan", active: activeMode === "plan" },
    { href: `/cities/${slug}/images`, label: "Images", active: activeMode === "images" },
    { href: `/cities/${slug}/assess`, label: "Assess", active: activeMode === "assess" },
  ];
}
