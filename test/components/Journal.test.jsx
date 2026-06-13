// Journal component tests (#43-style) — compose, existing entries, save, delete.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, test, expect, vi, beforeEach } from "vitest";

const addJournalEntry = vi.fn(async () => ({
  id: "new",
  body: "x",
  reaction: "",
  atPlace: "",
  createdAt: "2026-06-13T10:00:00Z",
}));
const editJournalEntry = vi.fn();
const removeJournalEntry = vi.fn();

vi.mock("../../components/PlannerProvider", () => ({
  usePlanner: () => ({ addJournalEntry, editJournalEntry, removeJournalEntry }),
}));

import Journal from "../../components/Journal";

const cityItem = {
  id: "c1",
  name: "Bled",
  journal: [
    {
      id: "e1",
      body: "Lovely lake walk",
      reaction: "loved",
      atPlace: "the promenade",
      createdAt: "2026-06-10T09:00:00Z",
      updatedAt: "2026-06-10T09:00:00Z",
    },
  ],
};

const emptyCity = { id: "c2", name: "Empty", journal: [] };

describe("Journal", () => {
  beforeEach(() => {
    addJournalEntry.mockClear();
    editJournalEntry.mockClear();
    removeJournalEntry.mockClear();
  });

  test("renders an existing entry body and place", () => {
    render(<Journal cityItem={cityItem} />);
    expect(screen.getByText("Lovely lake walk")).toBeInTheDocument();
    expect(screen.getByText(/the promenade/)).toBeInTheDocument();
  });

  test("Save is disabled when the body is empty", () => {
    render(<Journal cityItem={emptyCity} />);
    const saveBtn = screen.getByRole("button", { name: /Save entry/i });
    expect(saveBtn).toBeDisabled();
  });

  test("typing a body and clicking Save calls addJournalEntry with the text", async () => {
    render(<Journal cityItem={emptyCity} />);
    const textarea = screen.getByPlaceholderText(/What's it like here/i);
    await userEvent.type(textarea, "The market square is buzzing");
    const saveBtn = screen.getByRole("button", { name: /Save entry/i });
    expect(saveBtn).not.toBeDisabled();
    await userEvent.click(saveBtn);
    expect(addJournalEntry).toHaveBeenCalledWith(
      "c2",
      expect.objectContaining({ body: "The market square is buzzing" })
    );
  });

  test("clicking delete (confirmed) calls removeJournalEntry", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Journal cityItem={cityItem} />);
    const deleteBtn = screen.getByRole("button", { name: /delete/i });
    await userEvent.click(deleteBtn);
    expect(removeJournalEntry).toHaveBeenCalledWith("c1", "e1");
    vi.restoreAllMocks();
  });

  test("shows empty state when journal is empty", () => {
    render(<Journal cityItem={emptyCity} />);
    expect(screen.getByText(/No notes yet/i)).toBeInTheDocument();
  });
});
