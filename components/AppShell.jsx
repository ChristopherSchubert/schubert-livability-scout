"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { STAGES, citySlug, cityStage } from "../lib/planner-data";
import { usePlanner } from "./PlannerProvider";
import { useTrips } from "./TripProvider";

// Top-nav workflow modes. The home is "Board" (every candidate by stage);
// "Ranking" is a view toggle on the Board page, not a separate tab. The other
// tabs are the purpose-built stage workspaces. Stage IDs from STAGES drive the
// city metadata (badges, context strip color).
const NAV_MODES = [
  { id: "board",    href: "/board",    label: "Board",    help: "Every candidate, by stage.", stageId: null },
  { id: "planning", href: "/planning", label: "Planning", help: "Rank candidates and plan each trip's best week.", stageId: "planning" },
  { id: "planned",  href: "/planned",  label: "Planned",  help: "Trips with committed dates.", stageId: "planned" },
  { id: "visited",  href: "/visited",  label: "Visited",  help: "Back from a trip, awaiting the survey.", stageId: "visited" },
  { id: "assessed", href: "/assessed", label: "Assessed", help: "Where each visit landed — going back, or not.", stageId: "assessed" },
  { id: "baseline", href: "/baseline", label: "Baseline", help: "Rate places you already know — the answer key.", stageId: null },
  { id: "trips",    href: "/trips",    label: "Trips",    help: "Multi-city trips — plan, solve, book.", stageId: null },
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

// Toggle directional edge-fade classes so only the side that can actually
// scroll fades — the first tab isn't dimmed at the start, and a cut-off side
// reads clearly as "more this way."
function updateScrollEdges(nav) {
  if (!nav) return;
  const scrollable = nav.scrollWidth > nav.clientWidth + 1;
  const atStart = nav.scrollLeft <= 1;
  const atEnd = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 1;
  nav.classList.toggle("can-left", scrollable && !atStart);
  nav.classList.toggle("can-right", scrollable && !atEnd);
}

// Centers the active tab on mount/route change and keeps the directional
// edge-fade in sync as the row is scrolled or the viewport resizes.
function useTabNav(navRef, activeSelector, dep) {
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    scrollActiveTabIntoView(nav, activeSelector);
    updateScrollEdges(nav);
    const onScroll = () => updateScrollEdges(nav);
    nav.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      nav.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);
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
export default function AppShell({ activeMode, activeStage, cityItem, cityNav, tripItem, tripNav, children }) {
  const mode = activeMode || activeStage;
  const hasContext = !!(cityItem || tripItem);
  const headerRef = useRef(null);
  const [condensed, setCondensed] = useState(false);

  // Hide-on-scroll-down / show-on-scroll-up for the brand row (mobile): scrolling
  // down past the masthead collapses it so the menu rows stay pinned without the
  // brand eating space; scrolling up brings it back. (features/mobile.md)
  useEffect(() => {
    let lastY = window.scrollY;
    // Direct (no rAF) so it doesn't depend on animation-frame scheduling; the
    // work is a cheap scrollY read + a boolean setState that no-ops when
    // unchanged, and browsers already coalesce scroll events.
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 64) setCondensed(false);
      else if (y > lastY + 4) setCondensed(true);
      else if (y < lastY - 4) setCondensed(false);
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Publish the sticky header's live height so in-page sticky elements (the
  // stats axis switcher) can pin flush below it — even as it condenses. Tied to
  // the state that changes the height (condense + city vs not) plus viewport
  // resize, so it stays correct without depending on ResizeObserver timing.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const setVar = () =>
      document.documentElement.style.setProperty("--app-header-h", `${el.offsetHeight}px`);
    setVar();
    window.addEventListener("resize", setVar);
    return () => window.removeEventListener("resize", setVar);
  }, [condensed, cityItem]);

  // Track the header's height *continuously* (every frame of the collapse
  // animation) so the frozen stats chips follow it smoothly rather than jumping
  // to the end value. ResizeObserver fires throughout a CSS max-height transition.
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() =>
      document.documentElement.style.setProperty("--app-header-h", `${el.offsetHeight}px`)
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="shell">
      {/* `has-city` lets the mobile CSS collapse the redundant global funnel on
          city pages; `nav-condensed` hides the brand row on scroll-down. */}
      <div
        ref={headerRef}
        className={`sticky-header${cityItem ? " has-city" : ""}${tripItem ? " has-trip" : ""}${condensed ? " nav-condensed" : ""}`}
      >
        <TopBar activeMode={mode} />
        {cityItem ? <CityContextStrip cityItem={cityItem} cityNav={cityNav} /> : null}
        {tripItem ? <TripContextStrip tripItem={tripItem} tripNav={tripNav} /> : null}
      </div>
      <main className={`canvas${hasContext ? " has-context" : ""}`}>{children}</main>
    </div>
  );
}

function TopBar({ activeMode }) {
  const { exportPlanner, saveState, hydrated } = usePlanner();
  const navRef = useRef(null);

  // On a phone the tab row scrolls horizontally; keep the active stage centered
  // and in view (rect-based, never moves the window) and the directional
  // edge-fade in sync. (features/mobile.md)
  useTabNav(navRef, ".stage-tab.active", activeMode);

  return (
    <header className="topbar-v2">
      <div className="topbar-brand">
        <Link href="/board" className="brand-mark">
          <span className="brand-dot" aria-hidden="true" />
          <span>Schubert Atlas</span>
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
          link.download = "sojourn-planner.json";
          link.click();
          URL.revokeObjectURL(url);
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

function BackupMenu({ onExport }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`backup-menu${open ? " open" : ""}`}>
      <button type="button" className="backup-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        ⋯
      </button>
      {open ? (
        <div className="backup-pop" role="menu" onMouseLeave={() => setOpen(false)}>
          <button type="button" onClick={() => { setOpen(false); onExport(); }}>Download backup</button>
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

  // Keep the active sub-tab (Detail/Plan/Images/Assess) centered + the
  // directional edge-fade in sync when the row scrolls. (features/mobile.md)
  useTabNav(navRef, ".city-context-tab.active", cityNav);

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

// Trip context strip — the per-trip sub-nav, parallel to CityContextStrip but
// for /trips/[id]/*. Back arrow → the trips index, the trip name, then the
// Plan·Days·Book·Shelf·Grid·Map·Frame sub-tabs (each its own URL). Reuses the
// city-context CSS so the chrome matches the rest of the app.
function TripContextStrip({ tripItem, tripNav }) {
  const { updateTripFrame, saveState } = useTrips();
  const navRef = useRef(null);
  useTabNav(navRef, ".city-context-tab.active", tripNav);

  // Honest save state for the inline name field. The field is auto-persisted
  // (debounced) like everything else in the app — no Save button — so instead
  // of a button we surface the provider's real saveState: "Saving…" while a
  // write is in flight, a brief "Saved" when it lands. nameDirty (a ref, so it
  // doesn't re-fire this effect) scopes the indicator to name edits, not the
  // provider's other writes.
  const nameDirty = useRef(false);
  const hideTimer = useRef(null);
  const [nameStatus, setNameStatus] = useState(null); // null | saving | saved | error
  useEffect(() => {
    if (!nameDirty.current) return;
    const s = saveState?.status;
    if (s === "saving") {
      setNameStatus("saving");
    } else if (s === "saved") {
      nameDirty.current = false;
      setNameStatus("saved");
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setNameStatus(null), 1600);
    } else if (s === "error") {
      nameDirty.current = false;
      setNameStatus("error");
    }
  }, [saveState?.status, saveState?.at]);

  const name = tripItem.name || "";
  function onNameChange(event) {
    nameDirty.current = true;
    clearTimeout(hideTimer.current);
    setNameStatus("saving");
    updateTripFrame(tripItem.id, { name: event.target.value });
  }

  return (
    <div className="city-context stage-board trip-context">
      <div className="city-context-left">
        <Link href="/trips" className="city-context-back" aria-label="All trips">←</Link>
        <div className="city-context-text">
          <span className="city-context-stage">Trip</span>
          <label className="trip-name-edit">
            <input
              className="city-context-name trip-context-name"
              value={name}
              size={Math.max(name.length, "Untitled trip".length) + 1}
              placeholder="Untitled trip"
              onChange={onNameChange}
              aria-label="Trip name"
            />
            <svg className="trip-name-pencil" width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
            {nameStatus === "saving" ? <span className="trip-name-status">Saving…</span> : null}
            {nameStatus === "saved" ? <span className="trip-name-status saved">✓ Saved</span> : null}
            {nameStatus === "error" ? <span className="trip-name-status error">Not saved</span> : null}
          </label>
        </div>
      </div>
      {tripNav?.length ? (
        <nav className="city-context-nav" ref={navRef} aria-label="Trip views">
          {tripNav.map((item) => (
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

// The five-from-the-deck plus the Map + Frame surfaces, each a real URL.
export const TRIP_TABS = ["plan", "days", "book", "shelf", "grid", "map", "frame", "forks"];
export function defaultTripNav(trip, active) {
  const label = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  return TRIP_TABS.map((slug) => ({
    href: `/trips/${trip.id}/${slug}`,
    label: label(slug),
    active: active === slug,
  }));
}

export function defaultCityNav(cityItem, activeMode) {
  const slug = citySlug(cityItem);
  return [
    { href: `/cities/${slug}`, label: "Detail", active: activeMode === "detail" },
    { href: `/cities/${slug}/plan`, label: "Plan", active: activeMode === "plan" },
    // Image management needs local API keys (Google Places via the Keychain) and
    // is a measurement-time tool — surface it only on localhost/dev, never in
    // the deployed app. Same NODE_ENV gate as the dev sign-in button.
    ...(process.env.NODE_ENV !== "production"
      ? [{ href: `/cities/${slug}/images`, label: "Images", active: activeMode === "images" }]
      : []),
    { href: `/cities/${slug}/journal`, label: "Journal", active: activeMode === "journal" },
    { href: `/cities/${slug}/assess`, label: "Assess", active: activeMode === "assess" },
  ];
}
