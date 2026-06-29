"use client";

import { useMemo, useState } from "react";
import {
  cityImageQuery,
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
