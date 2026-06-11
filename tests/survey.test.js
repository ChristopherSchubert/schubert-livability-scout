// lib/survey.js — felt-score survey (issue #47 extraction). Locks the contract
// and proves the barrel re-export from planner-data is identity-equal (so the
// split didn't change what either import path resolves to).
import { describe, it, expect } from "vitest";
import * as survey from "../lib/survey.js";
import * as planner from "../lib/planner-data.js";

describe("survey contract", () => {
  it("emptySurvey has the 5 axes + slovenia, all null", () => {
    const s = survey.emptySurvey();
    expect(s).toMatchObject({
      setting: null,
      aliveness: null,
      fabric: null,
      realness: null,
      january: null,
      slovenia: null,
    });
  });
  it("surveyComplete needs all axes + the slovenia score", () => {
    expect(survey.surveyComplete(survey.emptySurvey())).toBe(false);
    const full = { setting: 4, aliveness: 5, fabric: 4, realness: 5, january: 3, slovenia: 9 };
    expect(survey.surveyComplete(full)).toBe(true);
    expect(survey.surveyComplete({ ...full, slovenia: null })).toBe(false);
  });
  it("feltScore returns the gut slovenia number, never an axis average", () => {
    expect(survey.feltScore({ slovenia: 8, setting: 1 })).toBe(8);
    expect(survey.feltScore({ slovenia: null })).toBe(null);
  });
  it("exposes 5 axes + the Slovenia anchor scale", () => {
    expect(survey.surveyAxes.map((a) => a.key)).toEqual([
      "setting",
      "aliveness",
      "fabric",
      "realness",
      "january",
    ]);
    expect(survey.SLOVENIA_ANCHORS.at(-1)).toMatchObject({ value: 10 });
  });
});

describe("godfile barrel re-export is identity-stable", () => {
  it("planner-data re-exports the same symbols", () => {
    expect(planner.emptySurvey).toBe(survey.emptySurvey);
    expect(planner.surveyAxes).toBe(survey.surveyAxes);
    expect(planner.feltScore).toBe(survey.feltScore);
    expect(planner.baselineReferences).toBe(survey.baselineReferences);
  });
});
