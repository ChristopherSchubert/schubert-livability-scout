export const STORAGE_KEY = "city-trial-planner-v1";

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
  return `${name} downtown main street public life people color photo`;
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
