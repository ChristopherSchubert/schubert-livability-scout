// @vitest-environment jsdom
// Trip display atoms (issues #21, #43). Renders under jsdom via Testing Library
// — the harness (#40) proving component tests work end-to-end.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimeChip, BookingBadge, MarkerSet, PlaceRef, EntryCard } from "../components/trip/atoms.jsx";

describe("TimeChip", () => {
  it("renders a point time", () => {
    render(<TimeChip time={{ mode: "point", at: "14:00" }} />);
    expect(screen.getByText(/2:00 PM/)).toBeInTheDocument();
  });
  it("announces a range from→to", () => {
    render(<TimeChip time={{ mode: "range", start: "14:00", end: "14:30" }} tzLabel="CEST" />);
    expect(screen.getByLabelText(/from 2:00 PM to 2:30 PM, CEST/)).toBeInTheDocument();
  });
  it("renders a fuzzy bucket label", () => {
    render(<TimeChip time={{ mode: "bucket", bucket: "morning" }} />);
    expect(screen.getByText(/Morning/)).toBeInTheDocument();
  });
});

describe("BookingBadge", () => {
  it("shows a confirmation code untruncated", () => {
    render(<BookingBadge status="booked" booking={{ confirmation: "FB-9921-LONG-CODE" }} />);
    expect(screen.getByText("FB-9921-LONG-CODE")).toBeInTheDocument();
  });
});

describe("MarkerSet", () => {
  it("renders icon + text label (never color-only)", () => {
    render(<MarkerSet markers={[{ type: "veg", source: "Google Places" }]} />);
    expect(screen.getByText("Vegetarian")).toBeInTheDocument();
  });
  it("renders nothing for an empty set", () => {
    const { container } = render(<MarkerSet markers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PlaceRef", () => {
  it("links directions to the named place", () => {
    render(<PlaceRef place={{ name: "Hiša Franko", placeId: "ChIJx" }} />);
    expect(screen.getByLabelText("Directions to Hiša Franko")).toBeInTheDocument();
  });
});

describe("EntryCard", () => {
  it("labels the card with title, category and cash-only", () => {
    render(
      <EntryCard
        entry={{ title: "Pletna boat", category: "activity", status: "booked", cost: { cashOnly: true }, time: { mode: "point", at: "14:00" } }}
      />
    );
    expect(screen.getByRole("button", { name: /Pletna boat, activity, booked, cash only/ })).toBeInTheDocument();
  });
});
