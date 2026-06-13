// TripVariations interaction tests (#43) — the Forks tab. Mocks TripProvider to
// assert fork creation writes the fork in ONE atomic frame write (the in-range
// entries become Option A implicitly — no per-entry tag burst, #62), and that
// switching a choice persists the new active choice.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, test, expect, vi, beforeEach } from "vitest";

const updateTripFrame = vi.fn();
vi.mock("../../components/TripProvider", () => ({
  useTrips: () => ({ updateTripFrame }),
}));
import TripVariations from "../../components/TripVariations";

const baseTrip = () => ({
  id: "t1", startDate: "2026-05-15", endDate: "2026-05-17",
  legs: [{ name: "Bled", arrive: "2026-05-15", depart: "2026-05-17" }],
  options: {},
  entries: [
    { id: "x", day: "2026-05-16", title: "Walk" },   // in range → should tag to A
    { id: "y", day: "2026-05-15", title: "Coffee" },  // in range
  ],
});

describe("TripVariations", () => {
  beforeEach(() => { updateTripFrame.mockClear(); });

  test("the composer creates a fork in a single atomic frame write (no per-entry tag burst)", async () => {
    render(<TripVariations trip={baseTrip()} />);
    await userEvent.click(screen.getByRole("button", { name: /Create fork/ }));
    // ONE write — the fork metadata; the in-range entries are Option A implicitly.
    expect(updateTripFrame).toHaveBeenCalledTimes(1);
    const patch = updateTripFrame.mock.calls.at(-1)[1];
    expect(patch.options.forks).toHaveLength(1);
    expect(patch.options.forks[0].choices).toHaveLength(2);
    expect(patch.options.forks[0].activeChoiceId).toBe("a");
  });

  test("renders an existing fork with A/B choices + decide-by, and switches", async () => {
    const trip = {
      ...baseTrip(),
      options: { forks: [{ id: "f1", name: "Piran vs Trieste", range: { from: "2026-05-15", to: "2026-05-17" }, choices: [{ id: "a", label: "Option A" }, { id: "b", label: "Option B" }], activeChoiceId: "a" }] },
      entries: [{ id: "a1", day: "2026-05-16", title: "Piran", option: { forkId: "f1", choiceId: "a" }, booking: { cancelBy: "2026-05-12" } }],
    };
    render(<TripVariations trip={trip} />);
    expect(screen.getByText("Piran vs Trieste")).toBeInTheDocument();
    expect(screen.getByText(/decide by 2026-05-12/)).toBeInTheDocument();
    // switching to Option B persists the active choice
    const choiceB = screen.getByRole("button", { name: /Option B/ });
    await userEvent.click(choiceB);
    expect(updateTripFrame.mock.calls.at(-1)[1].options.forks[0].activeChoiceId).toBe("b");
  });
});
