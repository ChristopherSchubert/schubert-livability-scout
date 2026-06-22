// YearSparkline tests (#68) — the compact 12-month comfort sparkline shown per
// row in the Compare view. Pure presentational: takes a 0–10 comfort series
// plus the selected / prime / off-season month indices and draws 12 bars. No
// provider, no data fetch — so we assert structure + the highlight classes.
import { render, screen } from "@testing-library/react";
import { describe, test, expect } from "vitest";
import YearSparkline from "../../components/YearSparkline";

// A plausible 12-month comfort series (Jan…Dec), peaking in spring/fall.
const SERIES = [2, 3, 5, 7, 9, 8, 6, 6, 8, 9, 5, 3];

describe("YearSparkline", () => {
  test("renders 12 bars from a full series", () => {
    const { container } = render(<YearSparkline series={SERIES} selectedMonth={5} />);
    expect(container.querySelectorAll(".rt-spark-bar")).toHaveLength(12);
  });

  test("marks the selected month", () => {
    const { container } = render(<YearSparkline series={SERIES} selectedMonth={4} />);
    const bars = container.querySelectorAll(".rt-spark-bar");
    expect(bars[4].classList.contains("sel")).toBe(true);
    expect(bars[3].classList.contains("sel")).toBe(false);
  });

  test("marks prime and off-season months", () => {
    const { container } = render(
      <YearSparkline series={SERIES} selectedMonth={0} primeIdx={4} offSeasonIdx={0} />
    );
    const bars = container.querySelectorAll(".rt-spark-bar");
    expect(bars[4].classList.contains("prime")).toBe(true);
    expect(bars[0].classList.contains("offseason")).toBe(true);
  });

  test("a null month renders a bar but flags it not-measured", () => {
    const gappy = [...SERIES];
    gappy[6] = null;
    const { container } = render(<YearSparkline series={gappy} selectedMonth={0} />);
    const bars = container.querySelectorAll(".rt-spark-bar");
    expect(bars).toHaveLength(12);
    expect(bars[6].classList.contains("na")).toBe(true);
  });

  test("no series → a muted placeholder, not bars", () => {
    const { container } = render(<YearSparkline series={null} selectedMonth={0} />);
    expect(container.querySelectorAll(".rt-spark-bar")).toHaveLength(0);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  test("is labelled for assistive tech", () => {
    render(<YearSparkline series={SERIES} selectedMonth={0} />);
    expect(screen.getByRole("img", { name: /comfort/i })).toBeInTheDocument();
  });
});
