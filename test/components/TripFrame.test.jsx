// TripFrame rendering tests (#43) — the briefing tab. Asserts the four panels
// render derived facts (and honest blanks) from a trip prop.
import { render, screen } from "@testing-library/react";
import { describe, test, expect, vi } from "vitest";

vi.mock("../../components/TripProvider", () => ({ useTrips: () => ({ updateEntry: vi.fn() }) }));
import TripFrame from "../../components/TripFrame";

const TRIP = {
  id: "t1", name: "Slovenia", startDate: "2026-05-15", endDate: "2026-05-18",
  legs: [{ name: "Bled, Slovenia", arrive: "2026-05-15", depart: "2026-05-18" }],
  travelers: [{ name: "Chris", kind: "person", chips: ["veg"] }],
  entries: [
    { id: "s", category: "stay", title: "Vila Bled", place: { name: "Vila Bled", lat: 46.3, lon: 14.1, placeId: "p1" }, time: { mode: "point", at: "15:00" } },
    { id: "u", category: "activity", title: "Mystery", day: "2026-05-16", time: { mode: "bucket" } }, // unpinned + unscheduled
    { id: "c", category: "meal", title: "Lunch", cost: { amount: 40, currency: "EUR", cashOnly: true }, place: { name: "X", lat: 46.3, lon: 14.1, placeId: "p2" }, day: "2026-05-16", time: { mode: "range", start: "13:00" } },
  ],
};

describe("TripFrame", () => {
  test("renders the four panels", () => {
    render(<TripFrame trip={TRIP} />);
    expect(screen.getByRole("heading", { name: "Glance" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Read first" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Booking checklist/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sources" })).toBeInTheDocument();
  });

  test("Glance shows real facts and honest blanks", () => {
    const { container } = render(<TripFrame trip={TRIP} />);
    expect(screen.getByText("Bled")).toBeInTheDocument();      // destination
    expect(screen.getByText("2026-05-15 – 2026-05-18")).toBeInTheDocument();
    // Weather isn't measured → rendered as a blank, never guessed
    expect(container.querySelector(".tf-blank")).toBeInTheDocument();
  });

  test("Read-first surfaces derived, cited limitations", () => {
    render(<TripFrame trip={TRIP} />);
    expect(screen.getByText(/pinned to a place/)).toBeInTheDocument(); // unpinned activity
    expect(screen.getByText(/in cash/)).toBeInTheDocument();           // €40 cash-only
  });
});
