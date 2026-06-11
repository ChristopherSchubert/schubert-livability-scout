export const STORAGE_KEY = "city-trial-planner-v1";

// ── IMAGE / SEARCH QUERIES ── extracted to ./image-queries.js (#47 godfile
// split); includes CITY_IMAGE_QUERY_OVERRIDES. slugify/autoImage/cityImageQuery/
// stayZoneImageQuery/blockImageQuery are used by the city factory + normalizeState
// (and by starterCities at module init), so import them back — ESM hoists the
// import so it's available before those run. The barrel re-exports the rest.
export * from "./image-queries.js";
import { slugify, autoImage, cityImageQuery, stayZoneImageQuery, blockImageQuery } from "./image-queries.js";

export const STAGES = [
  { id: "backlog",  label: "Backlog",  help: "Candidates not yet in planning. Triage here or in Ranking." },
  { id: "planning", label: "Planning", help: "Working the trip — rank the city and find its best week." },
  { id: "planned",  label: "Planned",  help: "Trip committed: dates are locked in." },
  { id: "visited",  label: "Visited",  help: "Back from the trip. Run the post-visit survey." },
  { id: "assessed", label: "Assessed", help: "Surveyed and decided: advance, winter-revisit, or eliminate." },
];

export const STAGE_INDEX = Object.fromEntries(STAGES.map((stage, index) => [stage.id, index]));

export function cityStage(cityItem, today = new Date()) {
  const decision = cityItem.decision || "Undecided";
  if (decision === "Advance" || decision === "Eliminate" || decision === "Winter Revisit") return "assessed";
  if (cityItem.status === "Eliminated") return "assessed";
  if (cityItem.status === "Visited") return "visited";
  const arrive = parseDate(cityItem.arriveDate);
  const depart = parseDate(cityItem.departDate);
  // Committed trip — scheduled with locked dates → Planned (upcoming or on-trip).
  if (cityItem.status === "Scheduled" && arrive && depart) return "planned";
  // Actively worked — ranked, or a trip still being slotted → Planning.
  if (cityItem.status === "Scheduled" || cityItem.status === "Shortlist" || arrive) return "planning";
  return "backlog";
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ── MEASURED METRICS ── extracted to ./metrics.js (#47 godfile split).
// emptyMeasured is also called internally (the city factory, normalizeState),
// so import it back alongside the barrel re-export.
export * from "./metrics.js";
import { emptyMeasured } from "./metrics.js";

// ── VISIT WINDOW ── extracted to ./visit-window.js (#47 godfile split).
// Re-exported here so existing `from "lib/planner-data"` imports keep working.
export * from "./visit-window.js";

// ── FELT-SCORE QUESTIONNAIRE ── extracted to ./survey.js (#47 godfile split).
// emptySurvey is also called internally (the city factory, normalizeState), so
// import it back — ESM hoists imports.
export * from "./survey.js";
import { emptySurvey } from "./survey.js";

// The `why` text is authoritative in the Supabase `cities.why` column and is
// edited per-city through the app. starterCities below only seeds the skeleton
// fields used to bootstrap a fresh DB; `why` is intentionally left empty here.
export const starterCities = [
  city("Santa Barbara, CA", "Lower State / Funk Zone / West Beach", "State St & Yanonali St", "Jun week 1", "", "You want beauty and daily walkability more than anti-wealth vibes.", "It feels too polished, expensive, or resort-adjacent.", [
    "State St between Gutierrez St and Yanonali St",
    "Yanonali St between State St and Anacapa St",
    "Anacapa St between Yanonali St and Mason St",
    "Cabrillo Blvd around Stearns Wharf",
    "Helena Ave / Santa Barbara St in the Funk Zone",
  ]),
  city("Ventura, CA", "Downtown Ventura / Pier", "Main St & California St", "Jun week 3", "", "You found the less-grand, more usable Santa Barbara.", "It feels too casual or thin after Slovenia.", [
    "Main St between Figueroa St and Fir St",
    "California St between Main St and Santa Clara St",
    "Main St between Oak St and California St",
    "Palm St between Main St and Santa Clara St",
    "Ventura Pier / Promenade at California St",
  ]),
  city("San Luis Obispo, CA", "Mission Plaza / Higuera / Garden", "Higuera St & Chorro St", "Jul week 1", "", "You want compact daily ease more than direct ocean drama.", "It feels too inland or college-town small.", [
    "Higuera St between Nipomo St and Osos St",
    "Garden St between Higuera St and Marsh St",
    "Chorro St between Monterey St and Higuera St",
    "Monterey St around Mission Plaza",
    "Broad St between Monterey St and Higuera St",
  ]),
  city("Santa Cruz, CA", "Downtown / Beach Hill edge", "Pacific Ave & Cooper St", "Jul week 3", "", "You like a little edge with your beauty.", "It feels too studenty, chaotic, or expensive for the polish level.", [
    "Pacific Ave between Cathcart St and Cooper St",
    "Cooper St / Abbott Square",
    "Front St near Abbott Square",
    "West Cliff Dr around Lighthouse Point",
    "Beach St near the Boardwalk / Wharf",
  ]),
  city("Monterey / Pacific Grove, CA", "Pacific Grove downtown", "Lighthouse Ave & 17th St", "Aug week 1", "", "Coastal-town feeling matters more than nightlife.", "It feels too sleepy or retiree-coded.", [
    "Lighthouse Ave between 16th St and Fountain Ave",
    "Forest Ave between Lighthouse Ave and Central Ave",
    "Ocean View Blvd near Lovers Point",
    "Cannery Row near Prescott Ave",
    "Alvarado St between Pearl St and Franklin St",
  ]),
  city("Hood River, OR", "Downtown Hood River", "Oak St & 2nd St", "Aug week 3", "", "Mountain-water-sport energy is your Bled substitute.", "Winter wind, gray, or housing scarcity dulls the everyday appeal.", [
    "Oak St between 1st St and 6th St",
    "2nd St between State St and Cascade Ave",
    "Cascade Ave between 1st St and 5th St",
    "Front St / waterfront trail near 2nd St",
    "Portway Ave near Waterfront Park",
  ]),
  city("Bellingham, WA", "Fairhaven + downtown", "Harris Ave & 11th St", "Sep week 1", "", "You want realness, water, trails, and texture.", "The winter darkness or split between Fairhaven and downtown wears on you.", [
    "Harris Ave between 10th St and 12th St",
    "11th St between Harris Ave and Mill Ave",
    "Taylor Dock / South Bay Trail",
    "Bay St / Holly St downtown",
    "Railroad Ave between Holly St and Magnolia St",
  ]),
  city("Ashland, OR", "Plaza / Lithia Park edge", "N Main St & E Main St", "Sep week 3", "", "You want a small civic place with nature touching downtown.", "It feels too small or too dependent on visitor seasons.", [
    "Ashland Plaza",
    "N Main St between Plaza and Lithia Way",
    "E Main St between 1st St and 3rd St",
    "Calle Guanajuato along Ashland Creek",
    "Winburn Way into Lithia Park",
  ]),
  city("Annapolis, MD", "City Dock / Historic Core", "Main St & Dock St", "Oct week 1", "", "Harbor public life matters more than West Coast nature.", "Humidity, tourism, or mid-Atlantic dampness takes it down.", [
    "Main St between Church Circle and City Dock",
    "Dock St / Ego Alley",
    "Maryland Ave between State Circle and Prince George St",
    "State Circle",
    "Severn Ave near Fourth St in Eastport",
  ]),
  city("Savannah, GA", "Historic District north of Forsyth", "Bull St & Broughton St", "Oct week 3", "", "Squares, shade, walking, and atmosphere beat mountain drama.", "Summer heat and tourism overwhelm livability.", [
    "Bull St from Johnson Square to Chippewa Square",
    "Broughton St between Whitaker St and Drayton St",
    "Jones St between Bull St and Abercorn St",
    "Forsyth Park north edge at Gaston St",
    "River St / Factors Walk near Barnard Ramp",
  ]),
  city("Charleston, SC", "Cannonborough / Elliotborough", "King St & Cannon St", "Nov week 1", "", "You want Southern urban energy with year-round outdoor life.", "Wealth, tourist pressure, flooding, or heat makes it feel wrong.", [
    "King St between Spring St and Calhoun St",
    "Cannon St between Coming St and King St",
    "Coming St near Cannon / Spring",
    "Broad St between King St and Meeting St",
    "Colonial Lake / Rutledge Ave edge",
  ]),
  city("St. Petersburg, FL", "Downtown Waterfront / Edge District", "Beach Dr NE & 2nd Ave NE", "Nov week 3", "", "Waterfront urbanism and winter public life beat old-world charm.", "Heat, insurance, or Florida car culture outside the core becomes too much.", [
    "Beach Dr NE between 1st Ave N and 5th Ave NE",
    "Central Ave between 2nd St and 11th St",
    "St. Pete Pier approach",
    "Bayshore Dr NE along Vinoy / North Straub Park",
    "1st Ave N / Baum Ave in the Edge District",
  ]),
  city("Beaufort, SC", "Bay Street / Waterfront Park", "Bay St & West St", "Unscheduled", "", "You want Piran-scale waterfront public life without needing a big-city backdrop.", "It feels too quiet, too humid, or too retirement-oriented outside the best blocks.", [
    "Bay St between West St and Carteret St",
    "Henry C. Chambers Waterfront Park",
    "West St between Bay St and Craven St",
    "Carteret St between Bay St and Craven St",
    "Port Republic St between West St and Carteret St",
  ]),
  city("St. Augustine, FL", "Historic Downtown / Bridge of Lions", "St George St & Hypolita St", "Unscheduled", "", "You want the closest Florida version of an old-world walking town.", "The tourist concentration overwhelms normal daily life or grocery-level practicality.", [
    "St George St between City Gate and Cathedral Pl",
    "Aviles St between King St and Charlotte St",
    "Cathedral Pl between St George St and Charlotte St",
    "Avenida Menendez along Matanzas Bay",
    "Bridge of Lions approach / Plaza de la Constitucion",
  ]),
  city("Greenville, SC", "Main Street / Falls Park", "S Main St & Falls Park Dr", "Unscheduled", "", "You want public realm, restaurants, and easier cost structure more than coastal romance.", "It feels too engineered, too inland, or too conventional compared with Slovenia.", [
    "S Main St between Broad St and Falls Park Dr",
    "Falls Park Dr / Liberty Bridge",
    "River St between Broad St and Falls Park Dr",
    "Augusta St near RiverPlace",
    "N Main St between Coffee St and Washington St",
  ]),
  city("Petaluma, CA", "Historic Downtown / Turning Basin", "Petaluma Blvd N & Western Ave", "Unscheduled", "", "You want California climate and texture without fully entering resort wealth.", "It does not have enough setting drama to compete with the benchmark towns.", [
    "Petaluma Blvd N between Washington St and Western Ave",
    "Western Ave between Petaluma Blvd N and Keller St",
    "Kentucky St between Washington St and Western Ave",
    "Water St / Turning Basin",
    "B St between 4th St and Petaluma Blvd S",
  ]),
  city("Carmel-by-the-Sea, CA", "Ocean Ave / Carmel Beach", "Ocean Ave & Dolores St", "Unscheduled", "", "Beauty, walkability, and winter climate outweigh discomfort with moneyed polish.", "It confirms that hyper-wealthy resort perfection is not the life you want.", [
    "Ocean Ave between Junipero St and Monte Verde St",
    "Dolores St between 5th Ave and 7th Ave",
    "San Carlos St between 5th Ave and 7th Ave",
    "Lincoln St between Ocean Ave and 7th Ave",
    "Scenic Rd / Carmel Beach at Ocean Ave",
  ]),
  city("Newburyport, MA", "Market Square / Waterfront", "State St & Water St", "Unscheduled", "", "You want harbor-town public life and Boston access more than mild winter perfection.", "Winter damp/cold shrinks public life too much.", [
    "State St between Pleasant St and Water St",
    "Market Square",
    "Water St between State St and Green St",
    "Inn St pedestrian lane",
    "Merrimac St / Waterfront Park boardwalk",
  ]),
  city("Cape May, NJ", "Washington Street Mall / Beach Ave", "Washington St & Decatur St", "Unscheduled", "", "You want a compact seaside walking town and can tolerate shoulder-season quiet.", "It empties out too much after holidays and becomes more resort than home.", [
    "Washington Street Mall between Ocean St and Perry St",
    "Carpenter Ln near Washington St",
    "Decatur St between Washington St and Beach Ave",
    "Beach Ave promenade at Convention Hall",
    "Jackson St between Beach Ave and Carpenter Ln",
  ]),
  city("Durango, CO", "Main Avenue / Animas River", "Main Ave & 9th St", "Unscheduled", "", "You want Bled's mountain energy more than coastal softness.", "Winter still makes the rhythm feel too cold or too seasonal.", [
    "Main Ave between 8th St and 11th St",
    "E 2nd Ave between 8th St and 11th St",
    "Animas River Trail near 9th St",
    "Main Ave near the Durango & Silverton depot",
    "College Dr between Main Ave and E 2nd Ave",
  ]),
  city("Charlottesville, VA", "Downtown Mall / Court Square", "E Main St & 2nd St SE", "Unscheduled", "", "You want a pedestrian public room with intellectual/cultural life.", "The surrounding city does not live up to the mall, or the college-town politics feel heavy.", [
    "Downtown Mall between 1st St N and 4th St NE",
    "2nd St SE between Market St and Water St",
    "Market St near Court Square",
    "Water St between 2nd St SE and 4th St SE",
    "W Main St near Dairy Market",
  ]),
  city("Eureka Springs, AR", "Historic Downtown", "Spring St & Center St", "Unscheduled", "", "You want character, hills, porches, and local weirdness more than polish.", "The town is too small, too tourist-dependent, or too disconnected from larger systems.", [
    "Spring St between Center St and Main St",
    "Main St between Spring St and North Main St",
    "Center St between Spring St and Mountain St",
    "Basin Spring Park",
    "N Main St near the trolley depot",
  ]),
  city("Old Town Alexandria, VA", "Old Town / King Street", "King St & Union St", "Unscheduled", "", "King Street holds public life in winter and the riverfront feels like part of daily routine.", "It reads as commute-town with a shopping strip, not a real neighborhood.", [
    "King St between Washington St and Union St",
    "Union St between Prince St and Cameron St",
    "Cameron St between Royal St and Lee St",
    "Market Square at City Hall",
    "Waterfront promenade between Prince St and Cameron St",
  ]),
  city("Lewes, DE", "Second Street / Lewes Beach", "Second St & Market St", "Unscheduled", "", "A small-scale waterfront town that holds public life through off-season.", "Beach town that hibernates and reveals a thin year-round core.", [
    "Second St between Market St and Savannah Rd",
    "Market St between Front St and Second St",
    "Front St along the canal",
    "Savannah Rd toward Lewes Beach",
    "Lewes Beach boardwalk",
  ]),
  city("New Castle, DE", "Historic District / The Strand", "Delaware St & 2nd St", "Unscheduled", "", "The historic district reads as lived-in, not a stage set.", "Too small, too quiet, or too closed Tuesday for real daily life.", [
    "Delaware St between The Strand and 3rd St",
    "The Strand between Delaware St and Harmony St",
    "Market Square / the Green",
    "Battery Park along the river",
    "2nd St between Delaware St and Harmony St",
  ]),
  city("Mystic, CT", "Downtown Mystic / Mystic River", "W Main St & Bank St", "Unscheduled", "", "Downtown holds together in shoulder season and the river is the actual center.", "Summer-only seafood-town economy with not much left in February.", [
    "W Main St between Holmes St and the Bascule Bridge",
    "E Main St between the Bascule Bridge and Pearl St",
    "Bank St between W Main St and Gravel St",
    "Cottrell St / Mystic Drawbridge Ice Cream block",
    "Holmes St along the river",
  ]),
  city("Litchfield, CT", "Litchfield Green / North Street", "North St & West St", "Unscheduled", "", "The Green reads as a year-round civic room, not a postcard background.", "Pretty but empty mid-week; weekend-house town when you scratch the surface.", [
    "Litchfield Green (Route 202 / Route 63 frame)",
    "North St between the Green and Prospect St",
    "South St between the Green and the Litchfield Historical Society",
    "West St between the Green and Spencer St",
    "Bantam Lake edge at Sandy Beach",
  ]),
  city("Essex, CT", "Main Street Essex Village", "Main St & Pratt St", "Unscheduled", "", "Compact perfection at a scale that still supports daily errands.", "Too small to sustain anything beyond the marina-inn axis.", [
    "Main St between Pratt St and Steamboat Dock",
    "Pratt St between Main St and the Connecticut River Museum",
    "Novelty Lane along the marina",
    "North Main St between the Griswold Inn and Methodist Hill",
    "Steamboat Dock at the river",
  ]),
  city("Newport, RI", "Historic Hill / Thames Street", "Thames St & Bowen's Wharf", "Unscheduled", "", "The historic peninsula has actual year-round residential rhythm.", "Summer-tourism dominance reveals a thinner off-season place.", [
    "Thames St between Memorial Blvd and America's Cup Ave",
    "Bowen's Wharf / Bannister's Wharf",
    "Spring St between Touro St and Mill St",
    "Lower Broadway between Washington Sq and Marlborough St",
    "Cliff Walk at Memorial Blvd",
  ]),
  city("Bristol, RI", "Hope Street / Bristol Harbor", "Hope St & State St", "Unscheduled", "", "Hope Street functions as a real daily spine without needing the postcard places nearby.", "Stuck between Providence and Newport with neither's intensity.", [
    "Hope St between Bradford St and Constitution St",
    "State St between Hope St and Thames St",
    "Thames St along the harbor",
    "Bristol Town Common",
    "East Bay Bike Path at Independence Park",
  ]),
  city("Northampton, MA", "Downtown Northampton / Smith College edge", "Main St & Pleasant St", "Unscheduled", "", "Cultural and pedestrian density survive when school is out.", "Too cold, too college-cycle dependent, or too inland for a Piran-like feel.", [
    "Main St between Pleasant St and West St",
    "Pleasant St between Main St and Strong Ave",
    "Strong Ave / Pearl St block",
    "Smith College gates at Elm St & Green St",
    "Mill River Greenway at Maines Field",
  ]),
];

// The 6th/7th positional args (formerly ifWins/ifFails) are accepted and
// ignored — the if_wins/if_fails columns were dropped in migration 0007.
// Legacy starterCities call sites below still pass strings positionally;
// rather than touch every seed line, the factory just discards them.
export function city(name, stayZone, heartIntersection, tripWeek, why, _legacyIfWins, _legacyIfFails, blocks) {
  return {
    id: globalThis.crypto?.randomUUID?.() || `${slugify(name)}-${Math.random().toString(36).slice(2, 10)}`,
    name,
    heroImage: autoImage(cityImageQuery(name, stayZone, heartIntersection)),
    stayZoneImage: autoImage(stayZoneImageQuery(name, stayZone)),
    status: tripWeek ? "Shortlist" : "Idea",
    tripWeek,
    stayZone,
    heartIntersection,
    why,
    arriveDate: "",
    departDate: "",
    tripLength: "7 nights",
    flightDetails: "",
    carDetails: "",
    lodgingDetails: "",
    logisticsNotes: "",
    blocks,
    blockGeometries: [],  // populated by the `blocks` measurer (lib/measurers/blocks.js) at onboard time
    blockImages: blocks.map((block) => autoImage(blockImageQuery(name, block))),
    days: [
      { title: "Arrival rhythm", plan: "Check in, walk the heart intersection, find an ordinary dinner, and note whether the place feels alive after dark." },
      { title: "Normal weekday", plan: "Coffee, grocery run, work block, neighborhood walk, casual dinner. Watch who is outside and why." },
      { title: "Nature day", plan: "Test the closest high-value nature access without making it feel like a vacation production." },
    ],
    checklists: {
      before: [
        { text: "Book lodging within a 10-minute walk of the heart intersection", done: false },
        { text: "Confirm direct flight and realistic drive time", done: false },
        { text: "Check winter weather and flood/fire/insurance risks", done: false },
      ],
      during: [
        { text: "Walk the core exploration zones at morning, afternoon, and evening", done: false },
        { text: "Work remotely from two cafes or coworking spots", done: false },
        { text: "Do grocery, pharmacy, gym, and dinner without using the car", done: false },
      ],
      after: [
        { text: "Write a 24-hour gut memo before comparing numbers", done: false },
        { text: "Score against Bled/Piran feeling, not generic livability", done: false },
        { text: "Decide advance, winter revisit, or eliminate", done: false },
      ],
    },
    firstImpressions: "",
    dailyLife: "",
    concerns: "",
    decisionMemo: "",
    finalRating: "",
    revisit: "Unknown",
    decision: "Undecided",
    // Calibration/baseline place (a known reference or control), not a real
    // candidate to visit — can be hidden from the ranking.
    isCalibration: false,
    // Felt-score questionnaire result. Null until surveyed.
    survey: emptySurvey(),
    // Objective/measured score (0–10) from the data pipeline. Null until a
    // city has actually been run through measurement — never faked.
    measured: null,
    // Per-metric data points, each { value, asOf } once measured (null until
    // then). Every key from metricTaxonomy is present, so the UI can show the
    // full cited taxonomy with "not yet measured" where data is missing.
    measuredMetrics: emptyMeasured(),
    // Drive hours from PIT (home). Logistical, not measured. Re-applied from
    // driveHrsFromPitSeed on normalize.
    driveHrsFromPit: null,
  };
}


// normalizeState fallback seed: ONLY qualitative `prime` / `offSeason` prose,
// for cities whose row hasn't been notes-edited. Climate normals come from the
// NASA POWER measurer; crowd seasonality from the Google Trends measurer. The
// earlier version carried hand-keyed climate arrays (violated CLAUDE.md's
// "no in-source per-city data" rule) — those values are now in Supabase. This
// prose seed is still debt to migrate. (Lives here, next to its only caller.)
const visitClimateSeed = {
  "Santa Barbara, CA": {
    notes: {
      prime: "Still warm and dry, but the summer crowds have cleared — the town returns to locals.",
      offSeason: "Mild and quiet — downtown on a gray winter weekday, the locals' version of the town.",
    },
  },
  "Savannah, GA": {
    notes: {
      prime: "The heat and humidity break, the squares are perfect, and the spring-festival crowds are long gone.",
      offSeason: "Cool and damp — do the squares hold their public life, or empty out?",
    },
  },
};

export function normalizeState(nextState) {
  const state = structuredClone(nextState);
  const existingNames = new Set(state.cities.map((item) => item.name));
  starterCities.forEach((starter) => {
    if (!existingNames.has(starter.name)) state.cities.push(structuredClone(starter));
  });

  state.cities.forEach((cityItem) => {
    cityItem.blocks ||= [];
    cityItem.blockGeometries ||= [];
    cityItem.why ||= "";
    cityItem.heroImage ||= autoImage(cityImageQuery(cityItem.name, cityItem.stayZone, cityItem.heartIntersection));
    cityItem.stayZoneImage ||= autoImage(stayZoneImageQuery(cityItem.name, cityItem.stayZone));
    cityItem.blockImages ||= cityItem.blocks.map((block) => autoImage(blockImageQuery(cityItem.name, block)));
    cityItem.days ||= [];
    cityItem.checklists ||= {};
    ["before", "during", "after"].forEach((key) => {
      cityItem.checklists[key] ||= [];
    });
    cityItem.revisit ||= "Unknown";
    cityItem.decision ||= "Undecided";
    cityItem.tripLength ||= "7 nights";
    cityItem.status ||= cityItem.tripWeek ? "Shortlist" : "Idea";

    // Felt-score questionnaire + objective measured metrics. The composite
    // scalar is recomputed live (weightedAxisScore) — not stored on the row.
    cityItem.survey = { ...emptySurvey(), ...(cityItem.survey || {}) };
    cityItem.measuredMetrics = { ...emptyMeasured(), ...(cityItem.measuredMetrics || {}) };

    // Visit window: climate + crowd season + season notes.
    //
    // Supabase is the source of truth for all three — the climate measurer
    // fills visit_climate from NASA POWER, the crowd-season measurer
    // (scripts/measure-crowd-season.py) fills crowd_season + crowd_intensity
    // from Google Trends, and season_notes is user-authored.
    //
    // visitClimateSeed retains ONE responsibility: a fallback for the qualitative
    // `prime` / `offSeason` prose, only used when a city's row hasn't been notes-edited.
    // It is NOT permitted to overwrite a measured climate or crowd_season — that
    // would silently replace cited data with hand-typed data, the exact
    // anti-pattern CLAUDE.md tells us to break.
    const seed = visitClimateSeed[cityItem.name];
    cityItem.visitClimate ??= seed?.climate ?? null;
    cityItem.crowdSeason ??= null;          // measured via cascade, never seeded now
    cityItem.crowdIntensity ??= null;
    cityItem.npsUnitCode ??= null;          // NPS override unit (top cascade tier)
    cityItem.seasonNotes ??= seed?.notes ?? null;

    // Drive-from-PIT lives on the row (see lib/city-row.js). Just defend
    // against undefined on legacy state.
    if (cityItem.driveHrsFromPit === undefined) cityItem.driveHrsFromPit = null;
  });

  state.selectedId ||= state.cities[0]?.id;
  return state;
}

export function defaultState() {
  return normalizeState({ cities: structuredClone(starterCities), selectedId: starterCities[0].id });
}

