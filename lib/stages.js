// Funnel stages + a city's derived stage — extracted from lib/planner-data.js
// (godfile split, #47). Isomorphic, self-contained. Re-exported from
// planner-data.js so existing import paths keep working.

export const STAGES = [
  { id: "backlog",  label: "Backlog",  help: "Places not yet in planning. Start here or browse in Compare." },
  { id: "planning", label: "Planning", help: "Working the trip — find its best week to visit." },
  { id: "planned",  label: "Planned",  help: "Trip committed: dates are locked in." },
  { id: "visited",  label: "Visited",  help: "Back from the trip. Run the post-visit survey." },
  { id: "assessed", label: "Assessed", help: "Back from the visit and reviewed — going back, a winter revisit, or not." },
];

export const STAGE_INDEX = Object.fromEntries(STAGES.map((stage, index) => [stage.id, index]));

// Post-visit revisit outcomes. The stored field + values are historical
// (`decision`: Advance / Winter Revisit / Eliminate) and round-trip through
// Supabase, so they stay; the UI speaks only the kept "would you go back?"
// question — never a verdict — the reframe from decision-tool to vacation app
// (#68). One home so the board chip, the archive filters, and the VisitReview
// capture flow can't drift apart.
export const REVISIT_OUTCOMES = ["Advance", "Winter Revisit", "Eliminate"];
const REVISIT_LABELS = {
  Advance: "Going back",
  "Winter Revisit": "Winter revisit",
  Eliminate: "Not going back",
};
export function revisitLabel(decision) {
  return REVISIT_LABELS[decision] || "Reviewed";
}

export function cityStage(cityItem, today = new Date()) {
  const decision = cityItem.decision || "Undecided";
  if (decision === "Advance" || decision === "Eliminate" || decision === "Winter Revisit") return "assessed";
  if (cityItem.status === "Eliminated") return "assessed";
  if (cityItem.status === "Visited") return "visited";
  // "Planned" derives from trip membership — a city that's a leg in any of the
  // owner's trips is Planned. PlannerProvider attaches `inTrip` to each
  // cityItem by intersecting cities with trip legs. The pre-#108 legacy bridge
  // (status='Scheduled' + arrive/depart on the city row) was retired in #112
  // once the one remaining pre-bridge row was migrated to a real trip — see
  // scripts/migrate-scheduled-cities-to-trips.mjs.
  if (cityItem.inTrip) return "planned";
  const arrive = parseDate(cityItem.arriveDate);
  // Actively worked — ranked, or a trip still being slotted (exploratory
  // dates set during swim-lane placement before the user clicks ✓ Commit).
  if (cityItem.status === "Shortlist" || arrive) return "planning";
  return "backlog";
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
