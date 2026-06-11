// Felt-score questionnaire / survey track — extracted from lib/planner-data.js
// (godfile split, #47). Isomorphic, self-contained. Re-exported from
// planner-data.js so existing import paths keep working.

// ── FELT-SCORE QUESTIONNAIRE ────────────────────────────────────────────
// The subjective track. Five independent failure-mode axes, each scored 1–5
// against fixed anchors drawn from places the owner has actually stood in,
// plus a 0–10 gut "Slovenia score" (the regression target) and a free note.
// Every axis option is anchored so nothing is rated in the abstract.
export const surveyAxes = [
  {
    key: "setting",
    label: "Setting",
    prompt: "Does where you are press in on you — water, terrain, prospect, a view that reorients you?",
    anchors: [
      { value: 1, label: "Terrain and prospect are not a felt presence" },
      { value: 2, label: "Landscape is in the background, not the foreground" },
      { value: 3, label: "Some setting — a river, a hill — present but quiet" },
      { value: 4, label: "Strong setting felt from the core" },
      { value: 5, label: "The setting IS the place" },
    ],
  },
  {
    key: "aliveness",
    label: "Aliveness",
    prompt: "On an ordinary weekday — not events, not weekends — are people out and lingering with no errand?",
    anchors: [
      { value: 1, label: "Little outdoor lingering; movement is point-to-point" },
      { value: 2, label: "Foot traffic is errand-driven" },
      { value: 3, label: "Some terrace life, people pause" },
      { value: 4, label: "Steady public life; people stay put" },
      { value: 5, label: "The public space is the living room" },
    ],
  },
  {
    key: "fabric",
    label: "Fabric",
    prompt: "Does the built fabric close around you — enclosure, human scale, a core that holds together?",
    anchors: [
      { value: 1, label: "Open layout; little enclosure" },
      { value: 2, label: "Short stretches of coherent fabric, interrupted" },
      { value: 3, label: "Coherent walkable core for a real distance" },
      { value: 4, label: "Continuous, dense, enclosing" },
      { value: 5, label: "A maze that wraps around you" },
    ],
  },
  {
    key: "realness",
    label: "Realness",
    prompt: "Is it a working resident town, or a resort / tourist set / trophy enclave?",
    anchors: [
      { value: 1, label: "Visitor economy with no year-round residency" },
      { value: 2, label: "Mostly visitors; thin year-round layer" },
      { value: 3, label: "Working town with a visitor economy on top" },
      { value: 4, label: "Clearly lived-in; tourists are incidental" },
      { value: 5, label: "Unmistakably a working town, hardware stores and laundromats" },
    ],
  },
  {
    key: "january",
    label: "January test",
    prompt: "Would there be outdoor public life on a gray Tuesday in February — or does it shutter?",
    anchors: [
      { value: 1, label: "Closes outside of peak season" },
      { value: 2, label: "Reduced winter rhythm; many places close" },
      { value: 3, label: "Quieter but alive; locals keep it going" },
      { value: 4, label: "Holds its rhythm through the cold months" },
      { value: 5, label: "Full year-round life regardless of season" },
    ],
  },
];

export const SLOVENIA_ANCHORS = [
  { value: 0, label: "None of the feeling" },
  { value: 3, label: "Some qualities, doesn't add up to the feeling" },
  { value: 5, label: "Pleasant; doesn't linger" },
  { value: 8, label: "Strong, short of the benchmark" },
  { value: 10, label: "Full Bled / Piran feeling" },
];

export function emptySurvey() {
  return {
    setting: null, aliveness: null, fabric: null, realness: null, january: null,
    slovenia: null,
    note: "",
    context: "",       // "memory" | "visited"
    takenAt: "",
  };
}

export function surveyComplete(survey) {
  if (!survey) return false;
  return surveyAxes.every((axis) => Number.isFinite(survey[axis.key]))
    && Number.isFinite(survey.slovenia);
}

// Felt score = the gut Slovenia number (0–10) when present. The five axes are
// diagnostic predictors, not a blended average — we never average them into
// the headline, by design (the gut number is the target, the axes explain it).
export function feltScore(survey) {
  if (!survey || !Number.isFinite(survey.slovenia)) return null;
  return Number(survey.slovenia);
}

// Places the owner already knows deeply. Surveyed from memory first to
// calibrate the whole system — the answer key, not candidates.
export const baselineReferences = [
  { name: "Bled, Slovenia",   note: "Slovenia benchmark." },
  { name: "Piran, Slovenia",  note: "Slovenia benchmark." },
  { name: "Ljubljana, Slovenia", note: "Slovenian capital — larger scale." },
  { name: "Shadyside, Pittsburgh", note: "Walkable Pittsburgh neighborhood." },
  { name: "Lawrenceville, Pittsburgh", note: "Butler St corridor, Pittsburgh." },
  { name: "Sewickley, PA",    note: "Beaver St downtown — calibration reference." },
  { name: "Oakmont, PA",      note: "Allegheny River Blvd — calibration reference." },
  { name: "Verona, PA",       note: "Calibration reference." },
  { name: "Allison Park, PA", note: "Suburban township north of Pittsburgh." },
];
