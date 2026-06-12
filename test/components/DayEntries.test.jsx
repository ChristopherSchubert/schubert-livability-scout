// DayEntries tests (#43) — the @dnd-kit sortable day list. Real pointer drags
// need a layout engine jsdom doesn't have (the reorder math is covered by the
// pure suites), so here we assert the sortable scaffold renders: a grip per
// row, and that the row body stays click-to-edit (the grip carries the drag).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, test, expect, vi } from "vitest";
import DayEntries from "../../components/DayEntries";

const LIST = [
  { id: "e1", category: "meal", title: "Breakfast", time: { mode: "range", start: "08:00" } },
  { id: "e2", category: "activity", title: "Castle", time: { mode: "range", start: "10:00" } },
  { id: "e3", category: "travel", title: "Drive", time: { mode: "range", start: "13:00" } },
];

describe("DayEntries", () => {
  test("renders one grip + one row per entry", () => {
    const { container } = render(
      <DayEntries tripId="t1" day="2026-05-16" list={LIST} onEdit={() => {}} onReorder={() => {}} />
    );
    expect(container.querySelectorAll(".tw-grip")).toHaveLength(3);
    expect(container.querySelectorAll(".tw-entry")).toHaveLength(3);
    expect(screen.getByText(/Castle/)).toBeInTheDocument();
  });

  test("each grip is a keyboard-reachable reorder control", () => {
    render(<DayEntries tripId="t1" day="2026-05-16" list={LIST} onEdit={() => {}} onReorder={() => {}} />);
    expect(screen.getByRole("button", { name: /Reorder Breakfast/ })).toBeInTheDocument();
  });

  test("clicking a row body edits; the grip does not (stops propagation)", async () => {
    const onEdit = vi.fn();
    const { container } = render(
      <DayEntries tripId="t1" day="2026-05-16" list={LIST} onEdit={onEdit} onReorder={() => {}} />
    );
    await userEvent.click(screen.getByRole("button", { name: /Edit Castle/ }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "e2" }));
    // clicking the grip alone must not open the editor
    onEdit.mockClear();
    await userEvent.click(container.querySelector(".tw-grip"));
    expect(onEdit).not.toHaveBeenCalled();
  });
});
