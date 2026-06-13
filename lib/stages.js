// Funnel stages + a city's derived stage — extracted from lib/planner-data.js
// (godfile split, #47). Isomorphic, self-contained. Re-exported from
// planner-data.js so existing import paths keep working.

export const STAGES = [
  { id: "backlog",  label: "Backlog",  help: "Candidates not yet in planning. Triage here or in Ranking." },
  { id: "planning", label: "Planning", help: "Working the trip — rank the city and find its best week." },
  { id: "planned",  label: "Planned",  help: "Trip committed: dates are locked in." },
  { id: "visited",  label: "Visited",  help: "Back from the trip. Run the post-visit survey." },
  { id: "assessed", label: "Assessed", help: "Back from the visit and reviewed — going back, a winter revisit, or not." },
];

export const STAGE_INDEX = Object.fromEntries(STAGES.map((stage, index) => [stage.id, index]));

// Post-visit outcomes. The stored values are historical (Advance / Winter
// Revisit / Eliminate); the UI speaks the kept "would you go back?" question
// rather than a verdict — the reframe from decision-tool to vacation app (#68).
// One home so the board chip, the archive filters, and the Decide capture flow
// can't drift apart.
export const DECISION_VALUES = ["Advance", "Winter Revisit", "Eliminate"];
const DECISION_LABELS = {
  Advance: "Going back",
  "Winter Revisit": "Winter revisit",
  Eliminate: "Not going back",
};
export function decisionLabel(decision) {
  return DECISION_LABELS[decision] || "Reviewed";
}

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
