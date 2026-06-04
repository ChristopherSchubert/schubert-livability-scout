// lib/measurers/admin.js — administrative attributes from a hardcoded lookup.
//
// Today this writes only `state_capital` because that's the one signal a
// hardcoded table answers correctly for every US city without an API call.
//
// TODO(population): chip rules want `population` to cap College Town at small
// cities. The Census Places ACS endpoint can deliver this but needs a FIPS
// place-code resolver (city name + state → code), which is non-trivial
// without a lookup table. For now, lib/chips.js#collegeTown falls back to
// `core_density` as a small-city proxy. When we have time, add a
// Wikidata SPARQL fetch here:
//   SELECT ?pop WHERE { ?city wdt:P17 wd:Q30; rdfs:label "Newport"@en;
//     wdt:P131* wd:Q1387; wdt:P1082 ?pop. } LIMIT 1
//
// TODO(county-seat): similar — needs a lookup table. Low priority.

const STATE_CAPITALS = {
  AL: "Montgomery", AK: "Juneau", AZ: "Phoenix", AR: "Little Rock",
  CA: "Sacramento", CO: "Denver", CT: "Hartford", DE: "Dover",
  FL: "Tallahassee", GA: "Atlanta", HI: "Honolulu", ID: "Boise",
  IL: "Springfield", IN: "Indianapolis", IA: "Des Moines", KS: "Topeka",
  KY: "Frankfort", LA: "Baton Rouge", ME: "Augusta", MD: "Annapolis",
  MA: "Boston", MI: "Lansing", MN: "Saint Paul", MS: "Jackson",
  MO: "Jefferson City", MT: "Helena", NE: "Lincoln", NV: "Carson City",
  NH: "Concord", NJ: "Trenton", NM: "Santa Fe", NY: "Albany",
  NC: "Raleigh", ND: "Bismarck", OH: "Columbus", OK: "Oklahoma City",
  OR: "Salem", PA: "Harrisburg", RI: "Providence", SC: "Columbia",
  SD: "Pierre", TN: "Nashville", TX: "Austin", UT: "Salt Lake City",
  VT: "Montpelier", VA: "Richmond", WA: "Olympia", WV: "Charleston",
  WI: "Madison", WY: "Cheyenne",
};

// Parse "Newport, RI" / "Pittsburgh (Lawrenceville), PA" / "Monterey / Pacific Grove, CA"
// into a normalized { city, state } pair. The city is the leading token before
// "/" or " (" and the state is the trailing 2-letter code.
function parseCityState(name) {
  if (!name) return { city: null, state: null };
  const stateMatch = name.match(/,\s*([A-Z]{2})\s*$/);
  const state = stateMatch ? stateMatch[1] : null;
  const headRaw = stateMatch ? name.slice(0, stateMatch.index) : name;
  const head = headRaw.split("/")[0].split("(")[0].trim();
  return { city: head, state };
}

export default {
  id: "admin",
  describe: "Administrative attributes (state capital; population TODO)",
  // City row, not coords, is the input here.
  needs: ["name"],
  writes: {
    measuredMetrics: ["admin"],
  },
  throttleMs: 0,
  async run({ name, asOf }) {
    const { city: place, state } = parseCityState(name);
    if (!state || !place) return { notes: "could not parse city/state from name" };
    const admin = {
      state_capital: STATE_CAPITALS[state] === place,
      // population: null,   // TODO — see file header
      // county_seat: null,  // TODO
    };
    return {
      measuredMetrics: {
        admin: { value: admin, asOf, source: "Hardcoded table (state capitals)", sourceUrl: null },
      },
      notes: admin.state_capital ? `state capital of ${state}` : "not a state capital",
    };
  },
};
