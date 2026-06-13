"use client";

import { useMemo, useState } from "react";
import {
  cityImageQuery,
  MONTHS,
  cityVisitWindow,
  monthlyComfortScores,
  visitNowScore,
  tripNights,
  citySlug,
  imageResearchBrief,
} from "../lib/planner-data";
import { appendBust, resolveImage } from "./PlannerProvider";
import { getSupabase } from "../lib/supabase";

// POST a chosen image to the save endpoint with the user's access token
// (storage upload runs under RLS as that user). `section.folder` is
// cities/<slug>/hero, so the slug is the second segment.
async function postSaveHero(section, candidate) {
  const { data: { session } } = await getSupabase().auth.getSession();
  const slug = (section.folder || "").split("/")[1];
  const response = await fetch("/api/images/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ slug, candidate }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Save failed");
  return data;
}

// VisitWindowPanel — the two diagnostic visit windows (Prime + Off-season) over a
// 12-month comfort strip. Quantitative climate drives the bars; qualitative
// season notes explain each recommended window. Shows "awaiting climate data"
// rather than faking when a city hasn't been measured.
function VisitWindowPanel({ cityItem }) {
  const win = cityVisitWindow(cityItem);
  if (!win) {
    return (
      <section className="panel visit-window">
        <div className="section-head"><div><h2>When to visit</h2><p>Awaiting climate data for {cityItem.name}. Once measured, the prime and off-season windows compute here.</p></div></div>
      </section>
    );
  }
  const maxComfort = 5;
  const nowIdx = new Date().getMonth();
  const series = monthlyComfortScores(cityItem);
  const now = visitNowScore(cityItem, nowIdx);
  const baseNow = series?.[nowIdx];
  const trend = (baseNow != null && now != null) ? now - baseNow : 0; // urgency boost
  const dontMiss = baseNow != null && baseNow >= 6 && trend >= 1;
  return (
    <section className="panel visit-window">
      <div className="section-head">
        <div>
          <h2>When to visit</h2>
          <p>Two windows on the year — the comfortable stretch and the quiet off-season.</p>
        </div>
        {now != null ? (
          <div className={`visit-now-badge${dontMiss ? " urgent" : ""}`}>
            <span className="visit-now-label">Visit now · {MONTHS[nowIdx]}</span>
            <strong>{now.toFixed(1)}<small>/10</small></strong>
            {trend >= 0.3 ? <span className="visit-now-trend">↓ trending down — don't miss it</span>
              : trend <= -0.3 ? <span className="visit-now-trend rising">↑ improving — peak later</span>
              : <span className="visit-now-trend steady">→ stable over the next 2 months</span>}
          </div>
        ) : null}
      </div>

      <div className="vw-windows">
        <article className="vw-card vw-prime">
          <p className="vw-tag">Prime visit</p>
          <strong>{win.prime ? win.prime.name : "—"}</strong>
          <p>{win.notes.prime || "Comfortable weather, after the crowds thin."}</p>
        </article>
        <article className="vw-card vw-offseason">
          <p className="vw-tag">Off-season visit</p>
          <strong>{win.offSeason ? win.offSeason.name : "—"}</strong>
          <p>{win.notes.offSeason || "The coldest, quietest stretch — the town with the crowds gone."}</p>
        </article>
      </div>

      <div className="vw-strip" role="img" aria-label="Monthly comfort and crowd">
        {win.months.map((mo) => {
          const isPrime = win.prime && mo.idx === win.prime.idx;
          const isOffSeason = win.offSeason && mo.idx === win.offSeason.idx;
          const isNow = mo.idx === nowIdx;
          const h = mo.comfort == null ? 0 : (mo.comfort / maxComfort) * 100;
          return (
            <div key={mo.idx} className={`vw-month${isPrime ? " prime" : ""}${isOffSeason ? " offseason" : ""}${isNow ? " now" : ""}`}>
              <div className="vw-bar-track">
                <span className="vw-bar" style={{ height: `${h}%` }} />
                {mo.crowd != null ? <span className="vw-crowd" style={{ height: `${(mo.crowd / 5) * 100}%` }} title={`Crowd ${mo.crowd}/5`} /> : null}
              </div>
              <span className="vw-month-label">{mo.name}</span>
              {mo.climate ? <span className="vw-month-temp">{mo.climate.hi}°</span> : null}
            </div>
          );
        })}
      </div>
      <div className="vw-legend">
        <span><i className="vw-key-comfort" /> Comfort (climate)</span>
        <span><i className="vw-key-crowd" /> Crowd (tourist season)</span>
        <span className="vw-source">Climate: NOAA NCEI normals · Crowd: observed season</span>
      </div>
    </section>
  );
}

export function VisitPlan({ cityItem, onPatch, onChangeDay, onChangeChecklist }) {
  const checklistKeys = [
    ["before", "Before Booking", "Bookings, dates, money down."],
    ["during", "During Visit", "What to actually test on the ground."],
    ["after", "After Visit", "Capture how it felt before it fades."],
  ];
  const days = cityItem.days || [];
  const nights = tripNights(cityItem.arriveDate, cityItem.departDate);
  return (
    <>
      <VisitWindowPanel cityItem={cityItem} />

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Trip Setup</h2>
            <p>Schedule the trip here, then fill in the real-world details as the visit comes together.</p>
          </div>
        </div>

        <div className="form-subhead">
          <span className="form-subhead-label">Schedule</span>
          {nights != null ? <span className="form-subhead-pill">{nights} night{nights === 1 ? "" : "s"}</span> : null}
        </div>
        <div className="form-grid schedule">
          <Field label="Status">
            <select value={cityItem.status} onChange={(event) => onPatch({ status: event.target.value })}>
              {["Idea", "Shortlist", "Scheduled", "Visited", "Eliminated"].map((status) => <option key={status}>{status}</option>)}
            </select>
          </Field>
          <Field label="Trip week">
            <input value={cityItem.tripWeek || ""} onChange={(event) => onPatch({ tripWeek: event.target.value })} placeholder="Jun week 1" />
          </Field>
          <Field label="Trip length">
            {/* When both dates are set they're authoritative — derive the length
                (was a free-text field that drifted to a stale "7 nights"). #54 */}
            {nights != null
              ? <input value={`${nights} night${nights === 1 ? "" : "s"}`} readOnly title="Derived from arrive → depart" />
              : <input value={cityItem.tripLength || ""} onChange={(event) => onPatch({ tripLength: event.target.value })} placeholder="7 nights" />}
          </Field>
          <Field label="Arrive">
            <input type="date" value={cityItem.arriveDate || ""} onChange={(event) => onPatch({ arriveDate: event.target.value })} />
          </Field>
          <Field label="Depart">
            <input type="date" value={cityItem.departDate || ""} onChange={(event) => onPatch({ departDate: event.target.value })} />
          </Field>
        </div>

        <div className="form-subhead">
          <span className="form-subhead-label">Logistics</span>
        </div>
        <div className="form-grid two logistics">
          <Field label="Flight details">
            <textarea rows={4} value={cityItem.flightDetails || ""} onChange={(event) => onPatch({ flightDetails: event.target.value })} placeholder="Airline, confirmation, arrival airport, notes" />
          </Field>
          <Field label="Car details">
            <textarea rows={4} value={cityItem.carDetails || ""} onChange={(event) => onPatch({ carDetails: event.target.value })} placeholder="Rental company, pickup/dropoff, parking notes" />
          </Field>
          <Field label="Lodging">
            <textarea rows={4} value={cityItem.lodgingDetails || ""} onChange={(event) => onPatch({ lodgingDetails: event.target.value })} placeholder="Address, confirmation, check-in, why this location" />
          </Field>
          <Field label="Logistics notes">
            <textarea rows={4} value={cityItem.logisticsNotes || ""} onChange={(event) => onPatch({ logisticsNotes: event.target.value })} placeholder="Groceries, coworking, gym, weather, backup plans" />
          </Field>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>In-City Itinerary</h2>
            <p>Build the week around ordinary life first, then layer in the beautiful stuff.</p>
          </div>
          <button type="button" className="add-row-btn" onClick={() => onChangeDay([...days, { title: `Day ${days.length + 1}`, plan: "" }])}>+ Add day</button>
        </div>
        {days.length === 0 ? (
          <div className="plan-empty">
            <p>No days mapped yet.</p>
            <button type="button" className="add-row-btn" onClick={() => onChangeDay([{ title: "Day 1", plan: "" }])}>+ Add the first day</button>
          </div>
        ) : (
          <div className="itinerary-list">
            {days.map((day, index) => (
              <article className="day-card" key={`${day.title}-${index}`}>
                <header className="day-card-head">
                  <span className="day-index">{index + 1}</span>
                  <input
                    className="day-title"
                    value={day.title}
                    onChange={(event) => onChangeDay(cityItem.days.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))}
                  />
                  <div className="row-actions">
                    <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => onChangeDay(moveItem(cityItem.days, index, -1))}>↑</button>
                    <button type="button" aria-label="Move down" disabled={index === days.length - 1} onClick={() => onChangeDay(moveItem(cityItem.days, index, 1))}>↓</button>
                    <button type="button" aria-label="Remove day" className="row-action-remove" onClick={() => onChangeDay(cityItem.days.filter((_, itemIndex) => itemIndex !== index))}>×</button>
                  </div>
                </header>
                <textarea
                  className="day-plan"
                  rows={3}
                  value={day.plan}
                  placeholder="Mornings at the market, a long walk, the ordinary stuff first…"
                  onChange={(event) => onChangeDay(cityItem.days.map((item, itemIndex) => itemIndex === index ? { ...item, plan: event.target.value } : item))}
                />
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Structured Checks</h2>
            <p>If something matters, it should live as a checklist item here instead of a floating note somewhere else.</p>
          </div>
        </div>
        <div className="checklist-grid">
          {checklistKeys.map(([key, label, blurb]) => {
            const items = cityItem.checklists?.[key] || [];
            const doneCount = items.filter((item) => item.done).length;
            return (
              <article className="card checklist-card" key={key}>
                <div className="checklist-card-head">
                  <div>
                    <h3>{label}</h3>
                    <p className="checklist-blurb">{blurb}</p>
                  </div>
                  {items.length > 0 ? <span className="checklist-count">{doneCount}/{items.length}</span> : null}
                </div>
                <div className="checklist-list">
                  {items.length === 0 ? (
                    <p className="checklist-empty">Nothing here yet.</p>
                  ) : items.map((item, index) => (
                    <label className={`check-row${item.done ? " done" : ""}`} key={`${key}-${index}`}>
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={(event) => onChangeChecklist({
                          ...cityItem.checklists,
                          [key]: cityItem.checklists[key].map((entry, entryIndex) => entryIndex === index ? { ...entry, done: event.target.checked } : entry),
                        })}
                      />
                      <input
                        value={item.text}
                        placeholder="Add a check…"
                        onChange={(event) => onChangeChecklist({
                          ...cityItem.checklists,
                          [key]: cityItem.checklists[key].map((entry, entryIndex) => entryIndex === index ? { ...entry, text: event.target.value } : entry),
                        })}
                      />
                      <button
                        type="button"
                        aria-label="Remove check"
                        className="row-action-remove"
                        onClick={() => onChangeChecklist({
                          ...cityItem.checklists,
                          [key]: cityItem.checklists[key].filter((_, entryIndex) => entryIndex !== index),
                        })}
                      >
                        ×
                      </button>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className="add-row-btn checklist-add"
                  onClick={() => onChangeChecklist({
                    ...cityItem.checklists,
                    [key]: [...items, { text: "", done: false }],
                  })}
                >
                  + Add
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}

export function ImagesPage({ cityItem, imageState, searchState, setSearchState, onPatch, onSaved }) {
  // One section per city — the hero. Stay-zone and per-zone images were
  // removed: too much curation surface for too little payoff, since the
  // hero is the only image surfaced on the Board / detail pages.
  const cityFolder = citySlug(cityItem);
  const sections = useMemo(() => {
    const heroQuery = cityImageQuery(cityItem.name, cityItem.stayZone, cityItem.heartIntersection);
    const heroResearch = imageResearchBrief(cityItem, "hero");
    return [
      {
        key: `${cityItem.id}::hero`,
        title: "City Hero Image",
        subtitle: cityItem.name,
        query: heroQuery,
        cityName: cityItem.name,
        folder: `cities/${cityFolder}/hero`,
        token: cityItem.heroImage,
        research: heroResearch,
        onSelect: (src) => onPatch({ heroImage: src }),
      },
    ];
  }, [cityItem, cityFolder, onPatch]);

  return (
    <div className="image-sections">
      {sections.map((section) => (
        <ImageSection
          key={section.key}
          section={section}
          imageState={imageState}
          searchState={searchState[section.key] || defaultSearch(section.query)}
          setSearchState={(next) => setSearchState((current) => ({ ...current, [section.key]: next }))}
          onSaved={(payload) => {
            onSaved(section.query, payload);
            if (payload.selectedSrc) section.onSelect(payload.selectedSrc);
          }}
        />
      ))}
    </div>
  );
}

function ImageSection({ section, imageState, searchState, setSearchState, onSaved }) {
  // One image per city — no choices array, no recent picks. Cache-bust
  // would still be useful if the storage path were stable, but the lib now
  // uses content-addressable filenames so each save produces a new URL.
  // The bust counter stays as belt-and-suspenders for any CDN in front.
  const activeSrc = resolveImage(section.token, section.query, imageState);
  const displayHeroSrc = activeSrc ? appendBust(activeSrc, imageState.version) : "";

  return (
    <article className="image-section hero-flow">
      <div className="hero-flow-grid">
        <div className="hero-flow-left">
          <div className="hero-preview">
            {displayHeroSrc ? (
              <img className="hero-preview-image" src={displayHeroSrc} alt={`${section.cityName} hero`} />
            ) : (
              <div className="hero-preview-empty">No hero image selected yet.</div>
            )}
          </div>
        </div>

        <div className="hero-flow-right">
          {section.research && (
            <div className="image-research-card">
              <div className="image-research-grid">
                <div>
                  <span className="image-research-label">Anchor</span>
                  <strong>{section.research.anchor}</strong>
                </div>
                <div>
                  <span className="image-research-label">Suggested search</span>
                  <strong>{section.research.imageQuery}</strong>
                </div>
              </div>
              {section.brief?.attractions ? (
                <p className="image-research-attractions"><strong>Attractions:</strong> {section.brief.attractions}</p>
              ) : null}
              <div className="image-research-actions">
                <button
                  type="button"
                  onClick={() => setSearchState({
                    ...searchState,
                    query: section.research.imageQuery,
                    page: 1,
                    message: "",
                  })}
                >
                  Use suggested search
                </button>
              </div>
            </div>
          )}

          <div className="image-search-body hero-search-body">
            <label>
              Search terms
              <input value={searchState.query} onChange={(event) => setSearchState({ ...searchState, query: event.target.value })} />
            </label>
            <div className="image-search-actions">
              <button type="button" onClick={() => runSearch(section, 1, searchState, setSearchState)}>Search</button>
              <button type="button" disabled={!searchState.results?.length} onClick={() => runSearch(section, searchState.page + 1, searchState, setSearchState)}>Next 5</button>
            </div>
            <p className="search-status">{searchState.status === "loading" ? "Searching..." : searchState.message}</p>

            <div className="image-search-results">
              {(searchState.results || []).map((result, index) => (
                <article className="image-result" key={`${result.imageUrl}-${index}`}>
                  <img src={result.thumb || result.imageUrl} alt={result.title || searchState.query} />
                  <div className="image-result-meta">
                    <strong>{result.title || "Search result"}</strong>
                    <span>{result.source || "Image result"}</span>
                    {result.width && result.height ? <span>{result.width} × {result.height}</span> : null}
                  </div>
                  <div className="image-result-actions">
                    <button
                      type="button"
                      className="primary use-as-hero"
                      onClick={() => saveHero(section, result, searchState, setSearchState, onSaved)}
                    >
                      Use as hero
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <details className="image-search-paste">
              <summary>Or paste an image URL (e.g. from Google Images)</summary>
              <PasteByUrlPanel section={section} setSearchState={setSearchState} onSaved={onSaved} />
            </details>
          </div>
        </div>
      </div>
    </article>
  );
}

// appendBust is now imported from PlannerProvider so every consumer uses
// the same global imageState.version counter.

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function defaultSearch(query) {
  return {
    query: query || "",
    page: 1,
    status: "idle",
    message: "",
    results: [],
  };
}

async function runSearch(section, page, searchState, setSearchState) {
  const next = { ...searchState, status: "loading", page, message: page === 1 ? "Searching..." : `Searching page ${page}...` };
  setSearchState(next);
  try {
    const response = await fetch("/api/images/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: next.query, page, cityName: section.cityName }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Search failed");
    setSearchState({
      ...next,
      status: "ready",
      results: data.results || [],
      message: (data.results || []).length
        ? `Showing ${(data.results || []).length} results from page ${page}.`
        : "No results. Try broader terms — drop the state, drop modifier words, or just the landmark name.",
    });
  } catch (error) {
    setSearchState({ ...next, status: "error", results: [], message: error.message || "Search failed" });
  }
}

// PasteByUrlPanel — paste any image URL (e.g. one you found on Google
// Images, right-clicked, and "Copied image address"), then save with a single
// "Use as hero" click. Wraps the same /api/images/save endpoint as the
// search-result flow.
function PasteByUrlPanel({ section, setSearchState, onSaved }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!url.trim()) return;
    setBusy(true);
    setSearchState((current) => ({ ...current, status: "loading", message: "Downloading and saving as hero…" }));
    try {
      const data = await postSaveHero(section, {
        title: title.trim() || "Pasted image",
        source: "Pasted URL",
        imageUrl: url.trim(),
        thumb: url.trim(),
        landingUrl: url.trim(),
      });
      onSaved(data);
      if (data.selectedSrc) section.onSelect(data.selectedSrc);
      setUrl("");
      setTitle("");
      setSearchState((current) => ({ ...current, status: "ready", message: "Saved pasted image as hero." }));
    } catch (error) {
      setSearchState((current) => ({ ...current, status: "error", message: error.message || "Save failed" }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="paste-url-panel">
      <label>
        Image URL
        <input
          type="url"
          placeholder="https://… (right-click an image on Google → Copy image address)"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <label>
        Title (optional)
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Short description" />
      </label>
      <div className="paste-url-actions">
        <button
          type="button"
          className="primary use-as-hero"
          disabled={!url.trim() || busy}
          onClick={save}
        >
          Use as hero
        </button>
      </div>
    </div>
  );
}

// saveHero — single primary action for both search results and pasted URLs.
// Backend writes a content-addressable file and overwrites manifest.images
// for this city. No slot concept.
async function saveHero(section, result, searchState, setSearchState, onSaved) {
  if (!result) return;
  const next = {
    ...searchState,
    status: "loading",
    message: "Downloading and saving as hero…",
  };
  setSearchState(next);
  try {
    const data = await postSaveHero(section, result);
    onSaved(data);
    if (data.selectedSrc) section.onSelect(data.selectedSrc);
    setSearchState({ ...next, status: "ready", message: "Saved as hero.", results: searchState.results });
  } catch (error) {
    setSearchState({ ...next, status: "error", message: error.message || "Save failed" });
  }
}

function moveItem(list, index, direction) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= list.length) return list;
  const items = [...list];
  const [moved] = items.splice(index, 1);
  items.splice(nextIndex, 0, moved);
  return items;
}
