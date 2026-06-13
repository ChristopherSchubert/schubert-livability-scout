// Display-atom rendering tests (#43). The small pieces every trip row composes.
import { render, screen } from "@testing-library/react";
import { describe, test, expect } from "vitest";
import { TimeChip, BookingBadge, CostTag, MarkerSet, CatIcon, entryTimeText } from "../../components/atoms";

describe("atoms", () => {
  test("TimeChip: range / point / bucket render the right text", () => {
    const { rerender } = render(<TimeChip entry={{ time: { mode: "range", start: "10:00", end: "11:30" } }} />);
    expect(screen.getByText("10:00–11:30")).toBeInTheDocument();
    rerender(<TimeChip entry={{ time: { mode: "point", at: "15:00" } }} />);
    expect(screen.getByText("15:00")).toBeInTheDocument();
    rerender(<TimeChip entry={{ time: { mode: "bucket" } }} />);
    expect(entryTimeText({ time: { mode: "bucket" } })).toBe("");
  });

  test("BookingBadge: shows a pill for a real status, nothing for none", () => {
    const { container, rerender } = render(<BookingBadge status="booked" />);
    expect(screen.getByText("booked")).toBeInTheDocument();
    rerender(<BookingBadge status="toBook" />);
    expect(screen.getByText("to book")).toBeInTheDocument();
    rerender(<BookingBadge status="none" />);
    expect(container).toBeEmptyDOMElement();
  });

  test("CostTag: € amount, cash-only prefix; nothing when no amount", () => {
    const { container, rerender } = render(<CostTag cost={{ amount: 40, currency: "EUR", cashOnly: true }} />);
    expect(screen.getByText(/💰/)).toBeInTheDocument();  // currency-neutral cash marker (#77)
    expect(screen.getByText(/€40/)).toBeInTheDocument();
    rerender(<CostTag cost={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("MarkerSet: one glyph per marker, with a label title; empty when none", () => {
    const { container } = render(<MarkerSet markers={[{ type: "veg" }, { type: "dog" }]} />);
    expect(container.querySelectorAll(".tw-marker")).toHaveLength(2);
    expect(container.querySelector('[title="Vegetarian"]')).toBeInTheDocument();
    const { container: empty } = render(<MarkerSet markers={[]} />);
    expect(empty).toBeEmptyDOMElement();
  });

  test("CatIcon: category glyph, neutral dot fallback", () => {
    const { rerender } = render(<CatIcon cat="meal" />);
    expect(screen.getByText("🍴")).toBeInTheDocument();
    rerender(<CatIcon cat="nope" />);
    expect(screen.getByText("•")).toBeInTheDocument();
  });
});
