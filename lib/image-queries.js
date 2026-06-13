// Image + search-query builders and per-city overrides — extracted from
// lib/planner-data.js (godfile split, #47). Isomorphic, self-contained.
// CITY_IMAGE_QUERY_OVERRIDES lives here with cityImageQuery (its only
// reader) to avoid a module-init ordering hazard. Re-exported from
// planner-data.js so existing import paths keep working.

// Regex-escape helper for the landmark matchers below (moved with its callers).
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Per-city overrides for the image search query, curated by hand so the
// app's Images-tab pre-fill (and the manifest key) actually fits each place.
// Append entries as heroes are sourced; falls back to the legacy template.
// Declared up here so cityImageQuery() can read it during module init
// (starterCities calls it before the function declaration is reached).
export const CITY_IMAGE_QUERY_OVERRIDES = {
  "Abingdon, VA": "Abingdon Virginia",
  "Allison Park, PA": "Hampton Township Allison Park PA",
  "Anacortes, WA": "Anacortes Washington",
  "Annapolis, MD": "Annapolis City Dock historic",
  "Asheville, NC": "Asheville NC downtown Pack Square",
  "Ashland, OR": "Ashland Oregon Lithia Park plaza",
  "Astoria, OR": "Astoria Oregon",
  "Athens, GA": "Athens Georgia",
  "Bainbridge Island (Winslow), WA": "Winslow Bainbridge Island Washington",
  "Beacon, NY": "Beacon NY Main Street",
  "Beaufort, SC": "Beaufort SC Bay Street waterfront",
  "Bellefonte, PA": "Bellefonte PA downtown Victorian",
  "Bellingham, WA": "Bellingham Fairhaven downtown",
  "Bend, OR": "Bend Oregon downtown Drake Park",
  "Berea, KY": "Berea Kentucky",
  "Bethlehem, PA": "Bethlehem PA downtown",
  "Bled, Slovenia": "Bled Slovenia lake town",
  "Boise (North End), ID": "Boise North End Idaho",
  "Boulder, CO": "Boulder CO downtown",
  "Bristol, RI": "Bristol RI downtown",
  "Buffalo (Allentown), NY": "Buffalo Allentown neighborhood",
  "Buffalo (Elmwood), NY": "Buffalo Elmwood Village neighborhood",
  "Burlington, VT": "Burlington VT downtown",
  "Camden, ME": "Camden Maine",
  "Cape Charles, VA": "Cape Charles Virginia",
  "Cape May, NJ": "Cape May Washington Street Mall",
  "Carmel-by-the-Sea, CA": "Carmel-by-the-Sea Ocean Avenue",
  "Carrboro / Chapel Hill, NC": "Carrboro Chapel Hill North Carolina",
  "Charleston, SC": "Charleston King Street historic",
  "Charlottesville, VA": "Charlottesville Downtown Mall",
  "Chattanooga, TN": "Chattanooga TN downtown",
  "Cincinnati (Over-the-Rhine), OH": "Cincinnati Over-the-Rhine",
  "Cleveland (Ohio City), OH": "Cleveland Ohio City neighborhood",
  "Cleveland (Tremont), OH": "Cleveland Tremont neighborhood",
  "Cold Spring, NY": "Cold Spring New York",
  "Columbus (German Village), OH": "Columbus German Village neighborhood",
  "Columbus (Short North), OH": "Columbus Short North neighborhood",
  "Davis, WV": "Davis West Virginia",
  "Deep Creek Lake (McHenry), MD": "McHenry Deep Creek Lake Maryland",
  "Dunedin, FL": "Dunedin Florida",
  "Durango, CO": "Durango Main Avenue downtown",
  "Easton, PA": "Easton PA downtown",
  "Essex, CT": "Essex CT village",
  "Eureka Springs, AR": "Eureka Springs historic downtown",
  "Floyd, VA": "Floyd Virginia",
  "Frederick, MD": "Frederick MD downtown",
  "Greenport, NY": "Greenport New York",
  "Greenville, SC": "Greenville SC Main Street Falls Park",
  "Harrisonburg, VA": "Harrisonburg VA downtown",
  "Hawley, PA": "Hawley Pennsylvania",
  "Hood River, OR": "Hood River Oregon downtown",
  "Hudson, NY": "Hudson NY downtown",
  "Ithaca, NY": "Ithaca NY downtown",
  "Jim Thorpe, PA": "Jim Thorpe PA downtown",
  "Kingston, NY": "Kingston NY downtown",
  "Knoxville, TN": "Knoxville TN downtown",
  "La Jolla, CA": "La Jolla California",
  "Lake George, NY": "Lake George New York",
  "Lake Placid, NY": "Lake Placid New York",
  "Lancaster, PA": "Lancaster PA downtown",
  "Lewes, DE": "Lewes Delaware downtown",
  "Lewisburg, PA": "Lewisburg PA downtown",
  "Lewisburg, WV": "Lewisburg WV downtown",
  "Lexington, VA": "Lexington VA downtown",
  "Litchfield, CT": "Litchfield CT green",
  "Ljubljana, Slovenia": "Ljubljana old town Prešeren Square",
  "Manteo, NC": "Manteo North Carolina",
  "Marblehead, MA": "Marblehead Massachusetts",
  "Monterey / Pacific Grove, CA": "Pacific Grove California downtown",
  "Morgantown, WV": "Morgantown WV downtown",
  "Mystic, CT": "Mystic CT downtown",
  "Naples (5th Ave South), FL": "5th Avenue South Naples Florida",
  "New Castle, DE": "New Castle Delaware historic district",
  "Newburyport, MA": "Newburyport Market Square waterfront",
  "Newport, RI": "Newport RI downtown",
  "Newport, VT": "Newport Vermont",
  "Northampton, MA": "Northampton MA downtown",
  "Oakmont, PA": "Oakmont PA downtown",
  "Old Forge, NY": "Old Forge New York",
  "Old Town Alexandria, VA": "Old Town Alexandria VA",
  "Onancock, VA": "Onancock Virginia",
  "Petaluma, CA": "Petaluma historic downtown",
  "Petoskey, MI": "Petoskey Michigan",
  "Piran, Slovenia": "Piran Slovenia old town",
  "Pittsburgh (Squirrel Hill), PA": "Pittsburgh Squirrel Hill",
  "Pittsburgh (Strip District), PA": "Pittsburgh Strip District",
  "Port Townsend, WA": "Port Townsend Washington",
  "Portland, ME": "Portland Maine downtown",
  "Princeton, NJ": "Princeton New Jersey",
  "Rhinebeck, NY": "Rhinebeck New York",
  "Richmond, VA": "Richmond VA downtown",
  "Roanoke, VA": "Roanoke VA downtown",
  "Rochester (Park Ave), NY": "Rochester NY Park Avenue",
  "Salem, MA": "Salem Massachusetts",
  "San Francisco (Noe Valley), CA": "Noe Valley San Francisco California",
  "Santa Cruz, CA": "Santa Cruz Pacific Avenue downtown",
  "Santa Fe, NM": "Santa Fe NM downtown",
  "Saranac Lake, NY": "Saranac Lake New York",
  "Sarasota (Burns Court), FL": "Burns Court Sarasota Florida",
  "Saratoga Springs, NY": "Saratoga Springs NY downtown",
  "Sausalito, CA": "Sausalito California",
  "Savannah, GA": "Savannah Georgia historic squares",
  "Schroon Lake, NY": "Schroon Lake New York",
  "St. Augustine, FL": "St Augustine historic St George Street",
  "St. Petersburg, FL": "St Petersburg Florida Beach Drive waterfront",
  "Staunton, VA": "Staunton VA downtown",
  "Traverse City, MI": "Traverse City Michigan",
  "Tucson (4th Avenue), AZ": "4th Avenue Tucson Arizona",
  "Verona, PA": "Verona PA downtown",
  "Wilmington, NC": "Wilmington North Carolina",
  "Wolfeboro, NH": "Wolfeboro New Hampshire",
};

// Funnel stages — the new IA spine. A city's stage is derived from the
// existing status/decision/date fields so no schema migration is required.

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 110);
}

export function citySlug(cityItem) {
  return slugify(cityItem.name);
}

export function autoImage(query) {
  return `commons-search:${query}`;
}

export function cityImageQuery(name) {
  if (CITY_IMAGE_QUERY_OVERRIDES[name]) return CITY_IMAGE_QUERY_OVERRIDES[name];
  // Bare place name — no "downtown/main street/public life" filler (the hero
  // query guidance: bare name + a landmark only, set per-city in the overrides
  // map above). #77
  return name;
}

export function stayZoneImageQuery(name, stayZone) {
  return `${name} ${cleanSearchPlace(stayZone || "downtown")} street life people color photo`;
}

export function blockImageQuery(name, block) {
  return `${name} ${focusAreaSearchSubject(block)} street life people outdoor dining public place color photo`;
}

export function blockMapQuery(name, block) {
  return formatMapSearchQuery(name, block);
}

export function cleanSearchPlace(value) {
  return String(value || "")
    .replaceAll("/", " ")
    .replaceAll("&", " ")
    .replace(/\bbetween\b.*$/i, "")
    .replace(/\bfrom\b.*$/i, "")
    .replace(/\baround\b/i, "")
    .replace(/\bnear\b/i, "")
    .replace(/\bat\b/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function blockEvidenceSubject(block) {
  return block
    .replace(/\bbetween\b.*$/i, "")
    .replace(/\bfrom\b.*$/i, "")
    .replace(/\baround\b/i, "")
    .replace(/\bnear\b/i, "")
    .replace(/\bat\b/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function focusAreaSearchSubject(block) {
  const clean = cleanSearchPlace(block);
  const landmark = landmarkSearchSubject(clean);
  if (landmark) {
    const anchor = leadingPlaceAnchor(block);
    return anchor && !new RegExp(`\\b${escapeRegExp(landmark)}\\b`, "i").test(anchor) ? `${anchor} ${landmark}` : landmark;
  }
  const segment = streetSegmentSubject(block);
  if (segment) return segment;
  return blockEvidenceSubject(clean);
}

export function streetSegmentSubject(block) {
  const match = String(block || "").match(/^(.+?)\s+between\s+(.+?)(?:\s+and\s+|$)/i);
  if (!match) return "";
  return cleanSearchPlace(`${match[1]} ${match[2]}`);
}

export function leadingPlaceAnchor(block) {
  return cleanSearchPlace(String(block || "").split(/\s+\/\s+|\s+near\s+|\s+around\s+|\s+at\s+/i)[0]);
}

export function landmarkSearchSubject(value) {
  const landmarks = [
    "Stearns Wharf", "Mission Plaza", "Abbott Square", "Lovers Point", "Cannery Row", "Waterfront Park", "Taylor Dock",
    "South Bay Trail", "Ashland Plaza", "Lithia Park", "City Dock", "Ego Alley", "State Circle", "Forsyth Park",
    "River Street", "Colonial Lake", "St. Pete Pier", "North Straub Park", "Henry C. Chambers Waterfront Park",
    "Bridge of Lions", "Plaza de la Constitucion", "Falls Park", "Liberty Bridge", "Turning Basin", "Carmel Beach",
    "Washington Street Mall", "Convention Hall", "Animas River Trail", "Downtown Mall", "Court Square", "Dairy Market",
    "Basin Spring Park",
  ];
  return landmarks.find((landmark) => new RegExp(`\\b${escapeRegExp(landmark)}\\b`, "i").test(value)) || "";
}

export function blockRepresentativeSubject(block) {
  const clean = blockEvidenceSubject(block);
  if (/\byanonali|helena|funk zone\b/i.test(clean)) return "Funk Zone restaurants wine tasting street scene";
  if (/\banacapa\b/i.test(clean)) return "Anacapa Street courthouse downtown street scene";
  if (/\bstate st|state street\b/i.test(clean)) return "Lower State Street downtown outdoor dining pedestrians";
  if (/\bstearns wharf|cabrillo|wharf\b/i.test(clean)) return "Stearns Wharf waterfront promenade beach";
  if (/\bmission plaza|plaza|square|state circle|court square|market square\b/i.test(block)) return `${clean} plaza public square people`;
  if (/\bwaterfront|harbor|dock|pier|promenade|bay|river|turning basin|ego alley\b/i.test(block)) return `${clean} waterfront promenade people`;
  if (/\bpark|trail|beach|bridge|lighthouse|falls|creek\b/i.test(block)) return `${clean} public outdoor gathering`;
  if (/\bmall|market|main st|main street|avenue|ave|street|st\b/i.test(block)) return `${clean} street life outdoor dining shops`;
  return `${clean} public life street scene`;
}

const focusAreaAnchorByCity = {
  "Santa Barbara, CA": {
    "State St between Gutierrez St and Yanonali St": "State Street Promenade",
    "Yanonali St between State St and Anacapa St": "Funk Zone",
    "Anacapa St between Yanonali St and Mason St": "Santa Barbara County Courthouse",
    "Cabrillo Blvd around Stearns Wharf": "Stearns Wharf",
    "Helena Ave / Santa Barbara St in the Funk Zone": "Funk Zone",
  },
  "Ventura, CA": {
    "Main St between Figueroa St and Fir St": "Downtown Ventura",
    "California St between Main St and Santa Clara St": "Ventura City Hall",
    "Main St between Oak St and California St": "Mission Park",
    "Palm St between Main St and Santa Clara St": "Ventura Botanical Gardens gateway",
    "Ventura Pier / Promenade at California St": "Ventura Pier",
  },
  "San Luis Obispo, CA": {
    "Higuera St between Nipomo St and Osos St": "Downtown SLO Farmers' Market zone",
    "Garden St between Higuera St and Marsh St": "Hotel SLO / Garden Street terraces",
    "Chorro St between Monterey St and Higuera St": "Mission Plaza",
    "Monterey St around Mission Plaza": "Mission Plaza",
    "Broad St between Monterey St and Higuera St": "Downtown Creamery / Broad Street district",
  },
  "Santa Cruz, CA": {
    "Pacific Ave between Cathcart St and Cooper St": "Pacific Avenue",
    "Cooper St / Abbott Square": "Abbott Square Market",
    "Front St near Abbott Square": "Abbott Square",
    "West Cliff Dr around Lighthouse Point": "Lighthouse Point",
    "Beach St near the Boardwalk / Wharf": "Santa Cruz Beach Boardwalk",
  },
  "Monterey / Pacific Grove, CA": {
    "Lighthouse Ave between 16th St and Fountain Ave": "Downtown Pacific Grove",
    "Forest Ave between Lighthouse Ave and Central Ave": "Pacific Grove Museum of Natural History district",
    "Ocean View Blvd near Lovers Point": "Lovers Point",
    "Cannery Row near Prescott Ave": "Cannery Row",
    "Alvarado St between Pearl St and Franklin St": "Alvarado Street",
  },
  "Hood River, OR": {
    "Oak St between 1st St and 6th St": "Downtown Hood River",
    "2nd St between State St and Cascade Ave": "Pacific Central Station / downtown Hood River",
    "Cascade Ave between 1st St and 5th St": "Hood River Hotel district",
    "Front St / waterfront trail near 2nd St": "Hood River Waterfront Park",
    "Portway Ave near Waterfront Park": "Waterfront Park",
  },
  "Bellingham, WA": {
    "Harris Ave between 10th St and 12th St": "Fairhaven Village Green",
    "11th St between Harris Ave and Mill Ave": "Historic Fairhaven",
    "Taylor Dock / South Bay Trail": "Taylor Dock",
    "Bay St / Holly St downtown": "Bellingham Downtown Station district",
    "Railroad Ave between Holly St and Magnolia St": "Railroad Avenue",
  },
  "Ashland, OR": {
    "Ashland Plaza": "Ashland Plaza",
    "N Main St between Plaza and Lithia Way": "Ashland Plaza",
    "E Main St between 1st St and 3rd St": "Lithia Springs Hotel district",
    "Calle Guanajuato along Ashland Creek": "Calle Guanajuato",
    "Winburn Way into Lithia Park": "Lithia Park",
  },
  "Annapolis, MD": {
    "Main St between Church Circle and City Dock": "Main Street Annapolis",
    "Dock St / Ego Alley": "Ego Alley",
    "Maryland Ave between State Circle and Prince George St": "Maryland Avenue",
    "State Circle": "Maryland State House",
    "Severn Ave near Fourth St in Eastport": "Eastport waterfront",
  },
  "Savannah, GA": {
    "Bull St from Johnson Square to Chippewa Square": "Chippewa Square",
    "Broughton St between Whitaker St and Drayton St": "Broughton Street",
    "Jones St between Bull St and Abercorn St": "Jones Street",
    "Forsyth Park north edge at Gaston St": "Forsyth Park fountain",
    "River St / Factors Walk near Barnard Ramp": "River Street",
  },
  "Charleston, SC": {
    "King St between Spring St and Calhoun St": "Upper King",
    "Cannon St between Coming St and King St": "Cannonborough-Elliotborough",
    "Coming St near Cannon / Spring": "The Daily / Upper King side streets",
    "Broad St between King St and Meeting St": "Broad Street",
    "Colonial Lake / Rutledge Ave edge": "Colonial Lake",
  },
  "St. Petersburg, FL": {
    "Beach Dr NE between 1st Ave N and 5th Ave NE": "Beach Drive",
    "Central Ave between 2nd St and 11th St": "Central Avenue",
    "St. Pete Pier approach": "St. Pete Pier",
    "Bayshore Dr NE along Vinoy / North Straub Park": "North Straub Park",
    "1st Ave N / Baum Ave in the Edge District": "EDGE District",
  },
  "Beaufort, SC": {
    "Bay St between West St and Carteret St": "Henry C. Chambers Waterfront Park",
    "Henry C. Chambers Waterfront Park": "Henry C. Chambers Waterfront Park",
    "West St between Bay St and Craven St": "Downtown Beaufort",
    "Carteret St between Bay St and Craven St": "Downtown Beaufort",
    "Port Republic St between West St and Carteret St": "Historic Beaufort",
  },
  "St. Augustine, FL": {
    "St George St between City Gate and Cathedral Pl": "St. George Street",
    "Aviles St between King St and Charlotte St": "Aviles Street",
    "Cathedral Pl between St George St and Charlotte St": "Plaza de la Constitucion",
    "Avenida Menendez along Matanzas Bay": "Bayfront / Castillo de San Marcos",
    "Bridge of Lions approach / Plaza de la Constitucion": "Bridge of Lions",
  },
  "Greenville, SC": {
    "S Main St between Broad St and Falls Park Dr": "Main Street Greenville",
    "Falls Park Dr / Liberty Bridge": "Falls Park on the Reedy",
    "River St between Broad St and Falls Park Dr": "RiverPlace",
    "Augusta St near RiverPlace": "RiverPlace",
    "N Main St between Coffee St and Washington St": "NOMA Square",
  },
  "Petaluma, CA": {
    "Petaluma Blvd N between Washington St and Western Ave": "Petaluma Theatre District",
    "Western Ave between Petaluma Blvd N and Keller St": "Historic Downtown Petaluma",
    "Kentucky St between Washington St and Western Ave": "Theater Square",
    "Water St / Turning Basin": "Petaluma Turning Basin",
    "B St between 4th St and Petaluma Blvd S": "Petaluma Arts Center district",
  },
  "Carmel-by-the-Sea, CA": {
    "Ocean Ave between Junipero St and Monte Verde St": "Ocean Avenue",
    "Dolores St between 5th Ave and 7th Ave": "Carmel Plaza district",
    "San Carlos St between 5th Ave and 7th Ave": "Downtown Carmel",
    "Lincoln St between Ocean Ave and 7th Ave": "Carmel-by-the-Sea village center",
    "Scenic Rd / Carmel Beach at Ocean Ave": "Carmel Beach",
  },
  "Newburyport, MA": {
    "State St between Pleasant St and Water St": "Market Square",
    "Market Square": "Market Square",
    "Water St between State St and Green St": "Newburyport waterfront",
    "Inn St pedestrian lane": "Inn Street",
    "Merrimac St / Waterfront Park boardwalk": "Waterfront Park",
  },
  "Cape May, NJ": {
    "Washington Street Mall between Ocean St and Perry St": "Washington Street Mall",
    "Carpenter Ln near Washington St": "Washington Street Mall",
    "Decatur St between Washington St and Beach Ave": "Congress Hall / Decatur Street",
    "Beach Ave promenade at Convention Hall": "Cape May Promenade",
    "Jackson St between Beach Ave and Carpenter Ln": "Jackson Street",
  },
  "Durango, CO": {
    "Main Ave between 8th St and 11th St": "Historic Downtown Durango",
    "E 2nd Ave between 8th St and 11th St": "Downtown Durango side streets",
    "Animas River Trail near 9th St": "Animas River Trail",
    "Main Ave near the Durango & Silverton depot": "Durango & Silverton Depot",
    "College Dr between Main Ave and E 2nd Ave": "Fort Lewis / north downtown edge",
  },
  "Charlottesville, VA": {
    "Downtown Mall between 1st St N and 4th St NE": "Downtown Mall",
    "2nd St SE between Market St and Water St": "IX Art Park / east Downtown Mall edge",
    "Market St near Court Square": "Court Square",
    "Water St between 2nd St SE and 4th St SE": "Water Street district",
    "W Main St near Dairy Market": "Dairy Market",
  },
  "Eureka Springs, AR": {
    "Spring St between Center St and Main St": "Basin Spring Park",
    "Main St between Spring St and North Main St": "Historic Downtown Eureka Springs",
    "Center St between Spring St and Mountain St": "Basin Spring Park",
    "Basin Spring Park": "Basin Spring Park",
    "N Main St near the trolley depot": "Eureka Springs Transit Center",
  },
};

const stayZoneAnchorByCity = {
  "Santa Barbara, CA": "Funk Zone",
  "Ventura, CA": "Downtown Ventura",
  "San Luis Obispo, CA": "Mission Plaza",
  "Santa Cruz, CA": "Abbott Square",
  "Monterey / Pacific Grove, CA": "Lovers Point",
  "Hood River, OR": "Waterfront Park",
  "Bellingham, WA": "Historic Fairhaven",
  "Ashland, OR": "Ashland Plaza",
  "Annapolis, MD": "City Dock",
  "Savannah, GA": "Chippewa Square",
  "Charleston, SC": "Upper King",
  "St. Petersburg, FL": "Beach Drive",
  "Beaufort, SC": "Henry C. Chambers Waterfront Park",
  "St. Augustine, FL": "Plaza de la Constitucion",
  "Greenville, SC": "Falls Park on the Reedy",
  "Petaluma, CA": "Petaluma Turning Basin",
  "Carmel-by-the-Sea, CA": "Ocean Avenue",
  "Newburyport, MA": "Market Square",
  "Cape May, NJ": "Washington Street Mall",
  "Durango, CO": "Historic Downtown Durango",
  "Charlottesville, VA": "Downtown Mall",
  "Eureka Springs, AR": "Basin Spring Park",
};

const cityImageAnchorByCity = {
  "Santa Barbara, CA": "Santa Barbara waterfront",
  "Ventura, CA": "Ventura Pier",
  "San Luis Obispo, CA": "Mission Plaza",
  "Santa Cruz, CA": "West Cliff Drive",
  "Monterey / Pacific Grove, CA": "Lovers Point",
  "Hood River, OR": "Columbia River waterfront",
  "Bellingham, WA": "Fairhaven waterfront",
  "Ashland, OR": "Ashland Plaza",
  "Annapolis, MD": "City Dock",
  "Savannah, GA": "Forsyth Park",
  "Charleston, SC": "Charleston waterfront",
  "St. Petersburg, FL": "St. Pete Pier",
  "Beaufort, SC": "Waterfront Park",
  "St. Augustine, FL": "Bridge of Lions",
  "Greenville, SC": "Falls Park on the Reedy",
  "Petaluma, CA": "Petaluma riverfront",
  "Carmel-by-the-Sea, CA": "Carmel Beach",
  "Newburyport, MA": "Newburyport waterfront",
  "Cape May, NJ": "Cape May Promenade",
  "Durango, CO": "Historic Downtown Durango",
  "Charlottesville, VA": "Downtown Mall",
  "Eureka Springs, AR": "Basin Spring Park",
};

export function focusAreaAnchor(cityItem, block) {
  return focusAreaAnchorByCity[cityItem.name]?.[block]
    || landmarkSearchSubject(block)
    || focusAreaSearchSubject(block)
    || cleanSearchPlace(block);
}

export function stayZoneAnchor(cityItem) {
  return stayZoneAnchorByCity[cityItem.name]
    || landmarkSearchSubject(cityItem.stayZone || "")
    || cleanSearchPlace(cityItem.stayZone || cityItem.heartIntersection || cityItem.name);
}

export function cityImageAnchor(cityItem) {
  return cityImageAnchorByCity[cityItem.name]
    || cleanSearchPlace(cityItem.name);
}

export function googleMapsSearchUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function googleImageSearchUrl(query) {
  return `https://www.google.com/search?udm=2&hl=en&q=${encodeURIComponent(query)}`;
}

function splitCityState(cityName) {
  const [cityPart, statePart] = String(cityName || "").split(",").map((part) => part.trim());
  return {
    cityPart: cityPart || String(cityName || "").trim(),
    statePart: statePart || "",
  };
}

function stripDirectionalLead(value) {
  return String(value || "")
    .replace(/^\b(the)\b\s+/i, "")
    .trim();
}

function blockToMapSubject(block) {
  const raw = String(block || "").trim();
  const betweenMatch = raw.match(/^(.+?)\s+between\s+(.+?)\s+and\s+(.+)$/i);
  if (betweenMatch) {
    return `${stripDirectionalLead(betweenMatch[1])} & ${stripDirectionalLead(betweenMatch[3])}`;
  }
  const fromMatch = raw.match(/^(.+?)\s+from\s+(.+?)\s+to\s+(.+)$/i);
  if (fromMatch) {
    return `${stripDirectionalLead(fromMatch[1])} & ${stripDirectionalLead(fromMatch[3])}`;
  }
  if (/\s+\/\s+/i.test(raw)) {
    return raw.replace(/\s*\/\s*/g, " & ").trim();
  }
  const nearLike = raw.match(/^(.+?)\s+(?:near|around|at)\s+(.+)$/i);
  if (nearLike) {
    return stripDirectionalLead(nearLike[2]);
  }
  return raw;
}

export function formatMapSearchQuery(cityName, subject) {
  const { cityPart, statePart } = splitCityState(cityName);
  const place = blockToMapSubject(subject);
  return [place, cityPart, statePart].filter(Boolean).join(", ");
}

export function formatImageSearchQuery(cityName, anchor) {
  const { cityPart, statePart } = splitCityState(cityName);
  const subject = stripDirectionalLead(anchor || cityPart);
  return [subject, `${cityPart}${statePart ? ` ${statePart}` : ""}`].filter(Boolean).join(", ");
}

export function imageResearchBrief(cityItem, kind, block = "") {
  if (kind === "hero") {
    const anchor = cityImageAnchor(cityItem);
    return {
      target: cityItem.name,
      anchor,
      mapsQuery: formatMapSearchQuery(cityItem.name, anchor),
      imageQuery: formatImageSearchQuery(cityItem.name, anchor),
      rationale: "Use the city-scale anchor that best compresses the overall setting and public life into one frame.",
    };
  }
  if (kind === "stay") {
    const anchor = stayZoneAnchor(cityItem);
    return {
      target: cityItem.stayZone || cityItem.heartIntersection || cityItem.name,
      anchor,
      mapsQuery: formatMapSearchQuery(cityItem.name, cityItem.heartIntersection || cityItem.stayZone || cityItem.name),
      imageQuery: formatImageSearchQuery(cityItem.name, anchor),
      rationale: "Use the nearest public anchor that explains why staying in this zone would feel alive day to day.",
    };
  }
  const anchor = focusAreaAnchor(cityItem, block);
  return {
    target: block,
    anchor,
    mapsQuery: formatMapSearchQuery(cityItem.name, block),
    imageQuery: formatImageSearchQuery(cityItem.name, anchor),
    rationale: "Start from the actual block in Maps, then use the nearest meaningful public anchor to find a representative image.",
  };
}

export function cityZones(cityItem) {
  const zoneMap = new Map();
  (cityItem.blocks || []).forEach((block, index) => {
    const anchor = focusAreaAnchor(cityItem, block);
    const key = `${slugify(anchor)}::${slugify(cityItem.name)}`;
    const brief = testSpotBrief(cityItem, block);
    const entry = zoneMap.get(key) || {
      id: `${cityItem.id || slugify(cityItem.name)}-zone-${zoneMap.size + 1}`,
      key,
      anchor,
      name: zoneName(anchor, block),
      blocks: [],
      attractions: [],
      startingPoint: formatMapSearchQuery(cityItem.name, block),
      pathway: "",
      knownFor: zoneKnownFor(cityItem.name, anchor, brief.knownFor),
      imageIntent: brief.imageIntent,
      imageQuery: formatImageSearchQuery(cityItem.name, anchor),
      mapQuery: formatMapSearchQuery(cityItem.name, block),
      firstIndex: index,
    };
    entry.blocks.push(block);
    entry.attractions = uniqueList([...entry.attractions, ...zoneAttractions(cityItem, block, anchor)]);
    entry.pathway = zonePathway(cityItem.name, entry.blocks);
    zoneMap.set(key, entry);
  });
  return Array.from(zoneMap.values());
}

export function blockImageIntent(block) {
  if (/\bplaza|square|park|waterfront|pier|promenade|wharf|dock|trail|beach|bridge|mall|market\b/i.test(block)) {
    return "Show the public place that would make you linger here.";
  }
  return "Show the street life, cafe row, event, or anchor business that gives this place a real pulse.";
}

function zoneName(anchor, block) {
  if (/\bfunk zone\b/i.test(anchor)) return "Funk Zone";
  if (/\bstate street promenade\b/i.test(anchor)) return "Lower State Promenade";
  if (/\bcourthouse\b/i.test(anchor)) return "Courthouse + Civic Core";
  if (/\bstearns wharf\b/i.test(anchor)) return "Waterfront + Wharf";
  if (/\bmission plaza\b/i.test(anchor)) return "Mission Plaza Core";
  if (/\babbott square\b/i.test(anchor)) return "Abbott Square + Pacific";
  if (/\blovers point\b/i.test(anchor)) return "Lovers Point Waterfront";
  if (/\bwaterfront park\b/i.test(anchor)) return "Waterfront Park";
  if (/\bcity dock\b/i.test(anchor)) return "City Dock";
  if (/\bforsyth park\b/i.test(anchor)) return "Forsyth + Bull Street";
  if (/\bbeach drive\b/i.test(anchor)) return "Beach Drive Waterfront";
  if (/\bplaza de la constitucion\b/i.test(anchor)) return "Plaza + Bayfront";
  return anchor || cleanSearchPlace(block);
}

function zoneAttractions(cityItem, block, anchor) {
  const attractions = [anchor];
  const landmark = landmarkSearchSubject(block);
  if (landmark && landmark !== anchor) attractions.push(landmark);
  if (/\bfunk zone\b/i.test(anchor)) attractions.push("The Lark", "Helena Avenue tasting rooms");
  if (/\bstate street promenade\b/i.test(anchor)) attractions.push("State Street cafes", "Lower State storefronts");
  if (/\bcourthouse\b/i.test(anchor)) attractions.push("County Courthouse", "Anacapa Street");
  if (/\bstearns wharf\b/i.test(anchor)) attractions.push("Stearns Wharf", "Cabrillo promenade");
  return uniqueList(attractions.filter(Boolean));
}

function zoneKnownFor(cityName, anchor, fallback) {
  if (/\bfunk zone\b/i.test(anchor)) return "This is the loose, social, food-and-wine zone between downtown and the water: patios, tasting rooms, galleries, and the kind of casual public spillover that makes a place feel used rather than merely admired.";
  if (/\bstate street promenade\b/i.test(anchor)) return "This is the main all-day pedestrian zone: cafes, storefronts, meals, errands, and the strongest test of whether the city can carry ordinary life on foot from morning through evening.";
  if (/\bcourthouse\b/i.test(anchor)) return "This is the civic and architectural zone: slower blocks, courthouse texture, shaded edges, and a good test of whether beauty and public life still hold once you step away from the busiest commercial strip.";
  if (/\bstearns wharf\b/i.test(anchor)) return "This is the waterfront zone: promenade, pier, beach edge, and the daily test of whether the ocean-facing public realm feels like part of life instead of just the scenic reward.";
  if (/\bmission plaza\b/i.test(anchor)) return "This is the civic-room zone: the plaza, its adjacent restaurant blocks, and the part of town most likely to tell you whether people actually linger and loop here in normal life.";
  if (/\babbott square\b/i.test(anchor)) return "This is the social core zone: market, food, patios, and the blocks where downtown energy condenses most clearly into visible public life.";
  if (/\blovers point\b/i.test(anchor)) return "This is the water-edge village zone: coastal path, gathering spots, and the blocks that test whether the place feels magnetic in everyday repetition rather than just in scenic flashes.";
  if (/\bcity dock\b/i.test(anchor)) return "This is the harbor-room zone: boats, promenades, restaurants, and the blocks where the town most clearly behaves like a real waterfront public square.";
  if (/\bforsyth park\b/i.test(anchor)) return "This is the public-room zone: the park and its adjacent streets where Savannah's walking rhythm, shade, and social life become easiest to feel in your body.";
  if (/\bbeach drive\b/i.test(anchor)) return "This is the waterfront urban zone: parks, restaurants, museums, and the stretch where outdoor life, strolling, and city energy overlap most naturally.";
  return fallback || `${anchor} is one of the main zones worth testing on foot in ${cityName}.`;
}

function zonePathway(cityName, blocks) {
  const [first, ...rest] = blocks;
  if (!first) return "";
  const subjects = [first, ...rest].map((item) => blockToMapSubject(item));
  if (subjects.length === 1) {
    return `Start at ${formatMapSearchQuery(cityName, first)} and loop the zone until the social rhythm becomes clear.`;
  }
  return `Start at ${formatMapSearchQuery(cityName, first)}, then continue through ${subjects.slice(1).join(" -> ")} before looping back.`;
}

function uniqueList(items) {
  return [...new Set((items || []).filter(Boolean))];
}

export function testSpotBrief(cityItem, block) {
  const cityName = cityItem.name;
  const clean = blockEvidenceSubject(block);
  let knownFor = `${clean} is one of the core walk-test areas in ${cityName}, useful for seeing whether the center has everyday foot traffic beyond the prettiest view.`;
  let whatToWatch = "Walk it once during coffee hours, once around dinner, and once after dark; look for locals, open doors, outdoor seating, errands, and whether lingering feels natural.";

  if (/\bstate st|state street\b/i.test(block)) {
    knownFor = "Lower State is the main downtown-to-waterfront spine: restaurants, bars, storefronts, hotels, and the daily test of whether Santa Barbara feels like a real pedestrian city.";
    whatToWatch = "Check whether the street has all-day rhythm, not just visitor traffic: coffee, lunch, after-work patios, evening strolling, and how comfortable the walk feels toward the beach.";
  } else if (/\byanonali|helena|funk zone\b/i.test(block)) {
    knownFor = "This is the Funk Zone edge: wine rooms, food, galleries, converted industrial buildings, and the less-formal social texture between downtown and the waterfront.";
    whatToWatch = "Look for casual spillover into the street: groups moving between places, patios that stay active, gallery or tasting-room energy, and whether it feels useful on a normal weekday.";
  } else if (/\banacapa\b/i.test(block)) {
    knownFor = "Anacapa gives you the civic and architectural side of downtown: courthouse texture, older buildings, side-street calm, and a useful contrast to State Street.";
    whatToWatch = "Test whether the side streets feel connected or dead: office workers, locals crossing between errands, quiet shade, and whether the beauty supports daily life or just photographs.";
  } else if (/\bstearns wharf|cabrillo|wharf\b/i.test(block)) {
    knownFor = "This is the waterfront test: beach promenade, pier, harbor views, mountains over the water, and the strongest public-room feeling near the ocean.";
    whatToWatch = "Separate beauty from livability: morning walkers, bike traffic, casual meals, sunset crowds, and whether you would actually return weekly instead of treating it as a vacation set piece.";
  } else if (/\bplaza|square|state circle|court square|market square|mission plaza\b/i.test(block)) {
    knownFor = `${clean} is the civic-room test: the place most likely to behave like a piazza, with sitting, crossing paths, events, and spontaneous lingering.`;
    whatToWatch = "Spend time without a plan. Watch whether people naturally pause, meet, sit, eat, and pass through, or whether it only works during programmed events.";
  } else if (/\bwaterfront|harbor|dock|pier|promenade|bay|river|turning basin|ego alley\b/i.test(block)) {
    knownFor = `${clean} is the water-edge test: views, walking loops, restaurants or benches, and the chance for public life to gather around the setting.`;
    whatToWatch = "Check morning, afternoon, and evening use. The question is whether the water creates a daily ritual, not just a scenic stop.";
  } else if (/\bpark|trail|beach|bridge|lighthouse|falls|creek\b/i.test(block)) {
    knownFor = `${clean} tests whether nature is directly attached to ordinary life rather than separated into weekend excursions.`;
    whatToWatch = "Look for people using it casually: short walks, benches, dogs, lunch breaks, commuting paths, and easy transitions back into cafes or errands.";
  } else if (/\bmall|market|main st|main street|avenue|ave|street|st\b/i.test(block)) {
    knownFor = `${clean} is a street-life test: shops, cafes, errands, small businesses, and the density of reasons to keep walking.`;
    whatToWatch = "Watch storefront continuity, patio life, local errands, evening lights, and whether the block still has pulse when nothing special is happening.";
  }

  const imageIntent = `${blockImageIntent(block)} Search for ${blockRepresentativeSubject(block).toLowerCase()}, not the literal intersection.`;
  return { knownFor, whatToWatch, imageIntent };
}
