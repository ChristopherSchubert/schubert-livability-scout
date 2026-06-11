// @vitest-environment jsdom
// Prop-driven trip panels (issue #43) — BookPanel + DayPlan render from a trip
// object alone (no provider), so they test cleanly. Proves the derived Book
// rollups and the agenda layout against real data.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import BookPanel from "../components/trip/BookPanel.jsx";
import DayPlan from "../components/trip/DayPlan.jsx";

const trip = {
  startDate: "2026-05-18",
  endDate: "2026-05-19",
  legs: [
    {
      cityId: "bled",
      name: "Bled",
      arrive: "2026-05-18",
      depart: "2026-05-19",
      tz: "Europe/Ljubljana",
    },
  ],
  passes: [{ id: "ljc", name: "Ljubljana City Card", cost: 36 }],
  entries: [
    {
      id: "pletna",
      day: "2026-05-19",
      category: "activity",
      status: "booked",
      title: "Pletna boat",
      time: { mode: "point", at: "14:00" },
      place: { lat: 46.36, lon: 14.1 },
      cost: { amount: 36, currency: "EUR", payment: "onSite", cashOnly: true },
    },
    {
      id: "vintgar",
      day: "2026-05-19",
      category: "activity",
      status: "toBook",
      title: "Vintgar Gorge",
      booking: { bookBy: "2026-05-01" },
    },
  ],
};

describe("BookPanel — derived rollups", () => {
  it("shows cash-to-carry, the to-book item, and passes", () => {
    render(<BookPanel trip={trip} />);
    expect(screen.getByText(/36 EUR/)).toBeInTheDocument();
    expect(screen.getByText(/Vintgar Gorge/)).toBeInTheDocument();
    expect(screen.getByText(/Ljubljana City Card/)).toBeInTheDocument();
  });
});

describe("DayPlan — agenda", () => {
  it("renders a section per day with the entry, and a Solve button", () => {
    render(
      <DayPlan trip={trip} onEditEntry={() => {}} onAddEntry={() => {}} onApplySolve={() => {}} />
    );
    expect(screen.getByText("2026-05-18")).toBeInTheDocument();
    expect(screen.getByText(/Pletna boat/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Solve day/ }).length).toBeGreaterThan(0);
  });
  it("invokes onAddEntry for a day when + Add is used", () => {
    const onAdd = vi.fn();
    render(
      <DayPlan trip={trip} onEditEntry={() => {}} onAddEntry={onAdd} onApplySolve={() => {}} />
    );
    screen.getAllByRole("button", { name: "+ Add" })[0].click();
    expect(onAdd).toHaveBeenCalledWith("2026-05-18");
  });
});
