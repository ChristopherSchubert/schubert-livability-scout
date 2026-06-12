// EntryRow interaction tests (#43) — the Days agenda row. Pure props, so no
// provider needed. Verifies the click + keyboard-activation → onEdit wiring and
// that the composed atoms show through.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, test, expect, vi } from "vitest";
import EntryRow from "../../components/EntryRow";

const ENTRY = {
  id: "e1", category: "meal", title: "Lunch at Ostarija",
  time: { mode: "range", start: "13:00", end: "14:00" },
  status: "booked", cost: { amount: 40, currency: "EUR", cashOnly: true },
  place: { name: "Ostarija" }, markers: [{ type: "veg" }],
};

describe("EntryRow", () => {
  test("renders the entry's time, title, place, status and cost", () => {
    const { container } = render(<ul><EntryRow e={ENTRY} onEdit={() => {}} /></ul>);
    expect(screen.getByText("13:00–14:00")).toBeInTheDocument();
    expect(screen.getByText(/Lunch at Ostarija/)).toBeInTheDocument();
    expect(container.querySelector(".tw-place")).toHaveTextContent("Ostarija");
    expect(screen.getByText("booked")).toBeInTheDocument();
    expect(screen.getByText(/€40/)).toBeInTheDocument();
  });

  test("clicking the row calls onEdit with the entry", async () => {
    const onEdit = vi.fn();
    render(<ul><EntryRow e={ENTRY} onEdit={onEdit} /></ul>);
    await userEvent.click(screen.getByRole("button", { name: /Edit Lunch at Ostarija/ }));
    expect(onEdit).toHaveBeenCalledWith(ENTRY);
  });

  test("Enter and Space activate the row from the keyboard", async () => {
    const onEdit = vi.fn();
    render(<ul><EntryRow e={ENTRY} onEdit={onEdit} /></ul>);
    const row = screen.getByRole("button", { name: /Edit Lunch at Ostarija/ });
    row.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onEdit).toHaveBeenCalledTimes(2);
  });

  test("renders a passed-in drag handle (the @dnd-kit grip)", () => {
    render(<ul><EntryRow e={ENTRY} onEdit={() => {}} handle={<button className="tw-grip">grip</button>} /></ul>);
    expect(screen.getByText("grip")).toBeInTheDocument();
  });
});
