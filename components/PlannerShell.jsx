"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  cityImageQuery,
  cityVisitWindow,
  cityZones,
  citySlug,
  feltScore,
  formatMapSearchQuery,
  imageResearchBrief,
  metricTaxonomy,
  metricMethod,
  metricFieldStats,
  relGoodness,
  axisRollup,
  surveyComplete,
} from "../lib/planner-data";
import { appendBust, resolveImage, usePlanner } from "./PlannerProvider";
import { getSupabase } from "../lib/supabase";
import MapEmbed from "./MapEmbed";

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

export function CityDetail({ cityItem, imageState }) {
  const heroQuery = cityImageQuery(cityItem.name, cityItem.stayZone, cityItem.heartIntersection);
  const heroSrc = resolveImage(cityItem.heroImage, heroQuery, imageState) || placeholderImage(cityItem.name);
  const stayMapQuery = formatMapSearchQuery(cityItem.name, cityItem.heartIntersection || cityItem.stayZone || cityItem.name);
  const zones = cityZones(cityItem);
  const felt = surveyComplete(cityItem.survey) ? feltScore(cityItem.survey) : null;

  return (
    <>
      <section className="hero-panel">
        <img className="hero-image" src={appendBust(heroSrc, imageState.version)} alt={`${cityItem.name} at its best`} />
      </section>

      <section className="summary-grid">
        <article className="card card-spacious">
          <p className="eyebrow">Why It Belongs</p>
          <h2>{cityItem.name}</h2>
          <p className="body-copy">{cityItem.why}</p>
        </article>

        <article className="card">
          <p className="eyebrow">Stay Zone</p>
          <h3>{cityItem.stayZone || "No stay zone set"}</h3>
          <p>Heart: {cityItem.heartIntersection || "No heart intersection set"}</p>
          <MapEmbed query={stayMapQuery} zoom={15} title="Stay zone" className="zone-map" />
        </article>

        <article className="card score-card-twin">
          <div className="twin-score">
            <p className="eyebrow">Measured</p>
            <strong>{cityItem.measured != null ? Number(cityItem.measured).toFixed(1) : "—"}</strong>
            <span>{cityItem.measured != null ? "from data" : "not yet measured"}</span>
          </div>
          <div className="twin-score">
            <p className="eyebrow">Felt</p>
            <strong>{felt != null ? felt.toFixed(0) : "—"}</strong>
            <span>{felt != null ? "your survey" : "not yet surveyed"}</span>
          </div>
        </article>
      </section>

      <MeasuredPanel cityItem={cityItem} />

      <section className="panel">
        <div className="section-head compact">
          <div>
            <p className="eyebrow">City Map</p>
            <h2>{cityItem.name}</h2>
          </div>
          <a className="map-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cityItem.name)}`} target="_blank" rel="noreferrer">Open city map</a>
        </div>
        <MapEmbed query={cityItem.name} zoom={11} title={`${cityItem.name} map`} className="city-map" />
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Exploration Zones</h2>
          </div>
        </div>
        <div className="spot-list">
          {zones.map((zone) => (
            <article className="spot-card spot-card-textonly" key={zone.id}>
              <div className="spot-grid">
                <div className="spot-copy">
                  <h3>{zone.name}</h3>
                  <p><strong>Attractions:</strong> {zone.attractions.join(", ")}</p>
                  <p><strong>Starting point:</strong> {zone.startingPoint}</p>
                  <p><strong>Pathway:</strong> {zone.pathway}</p>
                </div>
                <div className="spot-map-card">
                  <MapEmbed query={zone.mapQuery} zoom={16} title={`${zone.name} map`} className="inline-map" />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

// Draggable map loaded client-only (Leaflet needs window).
const MapPicker = dynamic(() => import("./MapPicker"), { ssr: false });

// MeasuredPanel — the full cited objective taxonomy, grouped by the five
// axes. Every metric shows its value + as-of date + source, or "not yet
// measured." Plus an adjustable visit-center map: move the pin and re-run
// the measurement routine around the new point.
function MeasuredPanel({ cityItem }) {
  const metrics = cityItem.measuredMetrics || {};
  const { planner, updateCity } = usePlanner();
  const [token, setToken] = useState(null);
  useEffect(() => { getSupabase().auth.getSession().then(({ data }) => setToken(data.session?.access_token || null)); }, []);

  // Distribution of every metric across the whole candidate field, so each
  // value can be placed in context. Axis rollups average the relative
  // goodness of that axis's measured metrics (0–10, relative to the field).
  const stats = useMemo(() => metricFieldStats(planner.cities), [planner.cities]);
  const rollup = useMemo(() => axisRollup(cityItem, stats), [cityItem, stats]);
  const fieldN = planner.cities.length;

  return (
    <section className="panel measured-panel">
      <div className="section-head">
        <div>
          <h2>Measured metrics</h2>
          <p>Objective data points, grouped by axis. Each is computed from one cited source — never hand-scored. The strip shows where this city falls against the other {fieldN} candidates; green = a relative strength, red = a relative weakness. Expand any metric to see how it's computed and what it found here.</p>
        </div>
      </div>

      <details className="visit-center-tool">
        <summary>Visit center — {cityItem.lat != null ? `${cityItem.lat.toFixed(4)}, ${cityItem.lon.toFixed(4)}` : "not set"} · drag to adjust & re-measure</summary>
        <p className="visit-center-help">This pin is where you'd <em>base a visit</em> — the measurement runs in a 700m core around it. Drag it (or click the map) to the spot you'd actually want to stay, then re-measure.</p>
        <MapPicker
          cityId={cityItem.id}
          name={cityItem.name}
          lat={cityItem.lat}
          lon={cityItem.lon}
          accessToken={token}
          onMeasured={(d) => {
            // Reflect the new center + composite locally without a reload.
            if (d.center) updateCity(cityItem.id, { lat: d.center.lat, lon: d.center.lon, measured: d.measured });
          }}
        />
      </details>

      <div className="measured-grid">
        {metricTaxonomy.map((group) => (
          <article key={group.axis} className="measured-group">
            <header className="measured-group-head">
              <h3>{group.label}</h3>
              <AxisScore score={rollup[group.axis]} />
            </header>
            <div className="metric-rows">
              {group.metrics.map((m) => {
                const dp = metrics[m.key];
                const value = dp && dp.value != null ? dp.value : null;
                const st = stats[m.key];
                return (
                  <details key={m.key} className="metric-row">
                    <summary>
                      <span className="metric-label">{m.label}</span>
                      <span className="metric-value">
                        {value != null ? formatMetric(value, m.unit) : <span className="measured-empty">—</span>}
                      </span>
                      <MetricStrip value={value} metric={m} st={st} unit={m.unit} />
                      <span className="metric-caret" aria-hidden="true">›</span>
                    </summary>
                    <div className="metric-detail">
                      <p className="metric-how">{metricMethod[m.key] || ""}</p>
                      <p className="metric-prov">
                        {value != null ? (
                          <>
                            <span>This city: <strong>{formatMetric(value, m.unit)}</strong></span>
                            {st && st.max !== st.min ? (
                              <span> · field {formatMetric(st.min, m.unit)}–{formatMetric(st.max, m.unit)}</span>
                            ) : null}
                            {dp.asOf ? <span> · as of {dp.asOf}</span> : null}
                          </>
                        ) : (
                          <span>Not yet measured for this city.</span>
                        )}
                        {" · "}
                        {m.sourceUrl
                          ? <a href={m.sourceUrl} target="_blank" rel="noreferrer">{m.source}</a>
                          : <span>{m.source}</span>}
                      </p>
                    </div>
                  </details>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// Axis rollup as a 0–10 bar. Relative to the current candidate field, so it
// answers "is this axis a strength for this city among our candidates."
function AxisScore({ score }) {
  if (score == null) {
    return <span className="axis-score axis-score-empty" title="Not enough measured metrics yet">—</span>;
  }
  const tone = score >= 6.6 ? "good" : score <= 3.4 ? "weak" : "mid";
  return (
    <div className={`axis-score axis-score-${tone}`} title="Average relative strength of this axis, 0–10, vs the candidate field">
      <div className="axis-score-bar"><span style={{ width: `${score * 10}%` }} /></div>
      <span className="axis-score-num">{score.toFixed(1)}</span>
    </div>
  );
}

// MetricStrip — places this city's value on the min→max range of the whole
// candidate field. Faint ticks are the other candidates; the bold marker is
// this city. Tone is direction-aware (green when on the good end for this
// metric, red on the bad end), so a glance reads strength vs weakness.
function MetricStrip({ value, metric, st, unit }) {
  if (value == null) return <span className="mstrip mstrip-na">not measured</span>;
  if (!st || st.max === st.min) return <span className="mstrip mstrip-solo">only value</span>;
  const t = (value - st.min) / (st.max - st.min);
  const g = relGoodness(value, metric, st);
  const tone = g >= 0.66 ? "good" : g <= 0.34 ? "weak" : "mid";
  return (
    <span
      className={`mstrip mstrip-${tone}`}
      title={`${formatMetric(value, unit)} — ${Math.round(g * 100)}th percentile of ${st.values.length} candidates (${metric.dir >= 0 ? "higher" : "lower"} is better)`}
    >
      <span className="mstrip-track">
        {st.values.map((v, i) => (
          <span key={i} className="mstrip-tick" style={{ left: `${((v - st.min) / (st.max - st.min)) * 100}%` }} />
        ))}
        <span className="mstrip-marker" style={{ left: `${t * 100}%` }} />
      </span>
    </span>
  );
}

function formatMetric(value, unit) {
  const n = Number(value);
  if (unit === "$") return `$${n.toLocaleString()}`;
  if (unit === "%") return `${n}%`;
  if (unit === "frac") return n.toFixed(2);
  if (unit === "0–100" || unit === "count" || unit === "days") return String(Math.round(n));
  return `${n.toLocaleString()} ${unit}`;
}

// VisitWindowPanel — the two diagnostic visit windows (Charm + Truth) over a
// 12-month comfort strip. Quantitative climate drives the bars; qualitative
// season notes explain each recommended window. Shows "awaiting climate data"
// rather than faking when a city hasn't been measured.
function VisitWindowPanel({ cityItem }) {
  const win = cityVisitWindow(cityItem);
  if (!win) {
    return (
      <section className="panel visit-window">
        <div className="section-head"><div><h2>When to visit</h2><p>Awaiting climate data for {cityItem.name}. Once measured, the charm and truth windows compute here.</p></div></div>
      </section>
    );
  }
  const maxComfort = 5;
  return (
    <section className="panel visit-window">
      <div className="section-head">
        <div>
          <h2>When to visit</h2>
          <p>Two diagnostic trips. A candidate should pass both before it advances.</p>
        </div>
      </div>

      <div className="vw-windows">
        <article className="vw-card vw-charm">
          <p className="vw-tag">Charm visit</p>
          <strong>{win.charm ? win.charm.name : "—"}</strong>
          <p>{win.notes.charm || "Comfortable weather, after the crowds thin."}</p>
        </article>
        <article className="vw-card vw-truth">
          <p className="vw-tag">Truth visit · the January test</p>
          <strong>{win.truth ? win.truth.name : "—"}</strong>
          <p>{win.notes.truth || "Deliberately off-season — does real life persist when tourists are gone?"}</p>
        </article>
      </div>

      <div className="vw-strip" role="img" aria-label="Monthly comfort and crowd">
        {win.months.map((mo) => {
          const isCharm = win.charm && mo.idx === win.charm.idx;
          const isTruth = win.truth && mo.idx === win.truth.idx;
          const h = mo.comfort == null ? 0 : (mo.comfort / maxComfort) * 100;
          return (
            <div key={mo.idx} className={`vw-month${isCharm ? " charm" : ""}${isTruth ? " truth" : ""}`}>
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
    ["before", "Before Booking"],
    ["during", "During Visit"],
    ["after", "After Visit"],
  ];
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
        <div className="form-grid four">
          <Field label="Status">
            <select value={cityItem.status} onChange={(event) => onPatch({ status: event.target.value })}>
              {["Idea", "Shortlist", "Scheduled", "Visited", "Eliminated"].map((status) => <option key={status}>{status}</option>)}
            </select>
          </Field>
          <Field label="Trip week">
            <input value={cityItem.tripWeek || ""} onChange={(event) => onPatch({ tripWeek: event.target.value })} placeholder="Jun week 1" />
          </Field>
          <Field label="Arrive">
            <input type="date" value={cityItem.arriveDate || ""} onChange={(event) => onPatch({ arriveDate: event.target.value })} />
          </Field>
          <Field label="Depart">
            <input type="date" value={cityItem.departDate || ""} onChange={(event) => onPatch({ departDate: event.target.value })} />
          </Field>
        </div>
        <div className="form-grid three">
          <Field label="Trip length">
            <input value={cityItem.tripLength || ""} onChange={(event) => onPatch({ tripLength: event.target.value })} placeholder="7 nights" />
          </Field>
          <Field label="Flight details">
            <textarea rows={5} value={cityItem.flightDetails || ""} onChange={(event) => onPatch({ flightDetails: event.target.value })} placeholder="Airline, confirmation, arrival airport, notes" />
          </Field>
          <Field label="Car details">
            <textarea rows={5} value={cityItem.carDetails || ""} onChange={(event) => onPatch({ carDetails: event.target.value })} placeholder="Rental company, pickup/dropoff, parking notes" />
          </Field>
        </div>
        <div className="form-grid two">
          <Field label="Lodging">
            <textarea rows={6} value={cityItem.lodgingDetails || ""} onChange={(event) => onPatch({ lodgingDetails: event.target.value })} placeholder="Address, confirmation, check-in, why this location" />
          </Field>
          <Field label="Logistics notes">
            <textarea rows={6} value={cityItem.logisticsNotes || ""} onChange={(event) => onPatch({ logisticsNotes: event.target.value })} placeholder="Groceries, coworking, gym, weather, backup plans" />
          </Field>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>In-City Itinerary</h2>
            <p>Build the week around ordinary life first, then layer in the beautiful stuff.</p>
          </div>
          <button type="button" onClick={() => onChangeDay([...(cityItem.days || []), { title: `Day ${(cityItem.days || []).length + 1}`, plan: "" }])}>Add day</button>
        </div>
        <div className="itinerary-list">
          {(cityItem.days || []).map((day, index) => (
            <div className="itinerary-row" key={`${day.title}-${index}`}>
              <input
                value={day.title}
                onChange={(event) => onChangeDay(cityItem.days.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))}
              />
              <textarea
                rows={3}
                value={day.plan}
                onChange={(event) => onChangeDay(cityItem.days.map((item, itemIndex) => itemIndex === index ? { ...item, plan: event.target.value } : item))}
              />
              <div className="row-actions">
                <button type="button" onClick={() => onChangeDay(moveItem(cityItem.days, index, -1))}>↑</button>
                <button type="button" onClick={() => onChangeDay(moveItem(cityItem.days, index, 1))}>↓</button>
                <button type="button" onClick={() => onChangeDay(cityItem.days.filter((_, itemIndex) => itemIndex !== index))}>×</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Structured Checks</h2>
            <p>If something matters, it should live as a checklist item here instead of a floating note somewhere else.</p>
          </div>
        </div>
        <div className="checklist-grid">
          {checklistKeys.map(([key, label]) => (
            <article className="card" key={key}>
              <div className="section-head compact">
                <h3>{label}</h3>
                <button
                  type="button"
                  onClick={() => onChangeChecklist({
                    ...cityItem.checklists,
                    [key]: [...(cityItem.checklists?.[key] || []), { text: "", done: false }],
                  })}
                >
                  Add
                </button>
              </div>
              <div className="checklist-list">
                {(cityItem.checklists?.[key] || []).map((item, index) => (
                  <div className="check-row" key={`${key}-${index}`}>
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
                      onChange={(event) => onChangeChecklist({
                        ...cityItem.checklists,
                        [key]: cityItem.checklists[key].map((entry, entryIndex) => entryIndex === index ? { ...entry, text: event.target.value } : entry),
                      })}
                    />
                    <button
                      type="button"
                      onClick={() => onChangeChecklist({
                        ...cityItem.checklists,
                        [key]: cityItem.checklists[key].filter((_, entryIndex) => entryIndex !== index),
                      })}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </article>
          ))}
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



function placeholderImage(label) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#ece3d4"/><text x="60" y="390" font-family="Arial" font-size="42" fill="#5f5a52">${escapeHtml(label.slice(0, 70))}</text></svg>`)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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
