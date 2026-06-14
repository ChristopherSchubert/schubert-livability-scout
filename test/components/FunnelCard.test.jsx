// CityCard score-tooltip provenance (#85). The Board's score uses learned
// weights once ≥6 places are surveyed; the badge tooltip must name the *actual*
// weighting in effect rather than asserting a fixed "equal weights".
import { render } from "@testing-library/react";
import { describe, test, expect, vi } from "vitest";

// Stub the provider image helpers so the card renders without the Supabase
// client / planner context.
vi.mock("../../components/PlannerProvider", () => ({
  resolveImage: () => null,
  appendBust: (s) => s,
}));

import { CityCard } from "../../components/FunnelCard";

const CITY = { id: "c1", name: "Testville", stayZone: "Old Town", measuredMetrics: {} };
const WEIGHTS = { setting: 1, aliveness: 2, fabric: 1, realness: 1, january: 1 };

const titleOf = (container) =>
  container.querySelector(".funnel-card-score").getAttribute("title");

describe("CityCard score tooltip provenance (#85)", () => {
  test("names learned weights when the learned set is in effect", () => {
    const { container } = render(
      <CityCard cityItem={CITY} imageState={{ version: 0 }} weights={WEIGHTS} usingLearnedWeights stage="backlog" />,
    );
    expect(titleOf(container)).toBe("Overall measured score (learned weights)");
  });

  test("names equal weights before the learned threshold", () => {
    const { container } = render(
      <CityCard cityItem={CITY} imageState={{ version: 0 }} weights={WEIGHTS} usingLearnedWeights={false} stage="backlog" />,
    );
    expect(titleOf(container)).toBe("Overall measured score (equal weights)");
  });
});
