// EntryEditor interaction tests (#43) — the entry side-sheet keystone. Mocks
// TripProvider so we assert the edit → updateEntry / remove → removeEntry /
// Escape → onClose wiring without a live Supabase context.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, test, expect, vi, beforeEach } from "vitest";

const updateEntry = vi.fn();
const removeEntry = vi.fn();
vi.mock("../../components/TripProvider", () => ({
  useTrips: () => ({ updateEntry, removeEntry }),
}));

import EntryEditor from "../../components/EntryEditor";

const ENTRY = { id: "e1", title: "Castle", category: "activity", status: "none", time: { mode: "range", start: "10:00" } };

describe("EntryEditor", () => {
  beforeEach(() => { updateEntry.mockClear(); removeEntry.mockClear(); });

  test("is a labelled modal dialog showing the entry title", () => {
    render(<EntryEditor tripId="t1" entry={ENTRY} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: /edit entry/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByDisplayValue("Castle")).toBeInTheDocument();
  });

  test("editing the title patches via updateEntry", async () => {
    render(<EntryEditor tripId="t1" entry={ENTRY} onClose={() => {}} />);
    await userEvent.type(screen.getByDisplayValue("Castle"), "!");
    expect(updateEntry).toHaveBeenCalled();
    const lastPatch = updateEntry.mock.calls.at(-1)[1];
    expect(lastPatch.title).toBe("Castle!");
  });

  test("changing the category patches the entry", async () => {
    render(<EntryEditor tripId="t1" entry={ENTRY} onClose={() => {}} />);
    await userEvent.selectOptions(screen.getByDisplayValue("activity"), "meal");
    expect(updateEntry.mock.calls.at(-1)[1].category).toBe("meal");
  });

  test("Escape closes the sheet", async () => {
    const onClose = vi.fn();
    render(<EntryEditor tripId="t1" entry={ENTRY} onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  test("Remove deletes the entry and closes", async () => {
    const onClose = vi.fn();
    render(<EntryEditor tripId="t1" entry={ENTRY} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(removeEntry).toHaveBeenCalledWith("e1");
    expect(onClose).toHaveBeenCalled();
  });
});
