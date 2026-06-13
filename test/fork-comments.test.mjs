// Tests for lib/fork-comments.js pure helpers (Janice #8).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rowToForkComment, forkCommentToRow,
  commentsByChoice, authorLabel, leanEmoji, choiceLabel, diffEntries,
} from "../lib/fork-comments.js";

// ── rowToForkComment ─────────────────────────────────────────────────────────
test("rowToForkComment: maps snake_case row to camelCase app object", () => {
  const row = {
    id: "uuid-1",
    trip_id: "trip-uuid",
    fork_id: "fork-piran",
    choice_id: "A",
    author_id: "author-uuid",
    body: "Great view!",
    lean: "up",
    created_at: "2026-05-21T10:00:00Z",
  };
  const c = rowToForkComment(row);
  assert.equal(c.id, "uuid-1");
  assert.equal(c.tripId, "trip-uuid");
  assert.equal(c.forkId, "fork-piran");
  assert.equal(c.choiceId, "A");
  assert.equal(c.authorId, "author-uuid");
  assert.equal(c.body, "Great view!");
  assert.equal(c.lean, "up");
  assert.equal(c.createdAt, "2026-05-21T10:00:00Z");
});

test("rowToForkComment: null choice_id and lean become null (not undefined)", () => {
  const c = rowToForkComment({ id: "x", trip_id: "t", fork_id: "f", choice_id: null, author_id: "a", body: "hi", lean: null, created_at: null });
  assert.equal(c.choiceId, null);
  assert.equal(c.lean, null);
  assert.equal(c.createdAt, null);
});

// ── forkCommentToRow ─────────────────────────────────────────────────────────
test("forkCommentToRow: maps camelCase to snake_case for insert", () => {
  const row = forkCommentToRow({ tripId: "t", forkId: "f", choiceId: "B", body: "Noted", lean: "down", authorId: "me" });
  assert.equal(row.trip_id, "t");
  assert.equal(row.fork_id, "f");
  assert.equal(row.choice_id, "B");
  assert.equal(row.body, "Noted");
  assert.equal(row.lean, "down");
  assert.equal(row.author_id, "me");
});

test("forkCommentToRow: absent choiceId/lean become null, not undefined", () => {
  const row = forkCommentToRow({ tripId: "t", forkId: "f", body: "hi", authorId: "me" });
  assert.equal(row.choice_id, null);
  assert.equal(row.lean, null);
});

// ── commentsByChoice ─────────────────────────────────────────────────────────
test("commentsByChoice: groups by choiceId; null key for general comments", () => {
  const comments = [
    { id: "1", choiceId: "A", body: "Love it" },
    { id: "2", choiceId: "B", body: "Not sure" },
    { id: "3", choiceId: null, body: "Both look great" },
    { id: "4", choiceId: "A", body: "Second thought" },
  ];
  const grouped = commentsByChoice(comments);
  assert.equal(grouped["A"].length, 2);
  assert.equal(grouped["B"].length, 1);
  assert.equal(grouped[null].length, 1);
  assert.equal(grouped["A"][0].id, "1");
});

test("commentsByChoice: empty array returns empty object", () => {
  const g = commentsByChoice([]);
  assert.deepEqual(g, {});
});

test("commentsByChoice: null/undefined input handled safely", () => {
  assert.deepEqual(commentsByChoice(null), {});
  assert.deepEqual(commentsByChoice(undefined), {});
});

// ── authorLabel ──────────────────────────────────────────────────────────────
test("authorLabel: returns 'You' for the logged-in user when no profiles map", () => {
  assert.equal(authorLabel("my-uid", "my-uid", [], null), "You");
});

test("authorLabel: returns 'Them' for an unknown other user", () => {
  assert.equal(authorLabel("other-uid", "my-uid", [], null), "Them");
});

test("authorLabel: uses profiles map when available", () => {
  const profiles = { "other-uid": "Chris" };
  assert.equal(authorLabel("other-uid", "my-uid", [], profiles), "Chris");
});

test("authorLabel: profiles map wins even for the current user", () => {
  const profiles = { "my-uid": "Janice" };
  assert.equal(authorLabel("my-uid", "my-uid", [], profiles), "Janice");
});

// ── leanEmoji ────────────────────────────────────────────────────────────────
test("leanEmoji: up → 👍, down → 👎, null/other → null", () => {
  assert.equal(leanEmoji("up"), "👍");
  assert.equal(leanEmoji("down"), "👎");
  assert.equal(leanEmoji(null), null);
  assert.equal(leanEmoji(""), null);
  assert.equal(leanEmoji(undefined), null);
});

// ── choiceLabel ──────────────────────────────────────────────────────────────
test("choiceLabel: null choiceId → 'general'", () => {
  assert.equal(choiceLabel(null, [{ id: "A", label: "Option A" }]), "general");
});

test("choiceLabel: known choiceId → 're: <label>'", () => {
  const choices = [{ id: "A", label: "All-in Piran" }, { id: "B", label: "Trieste + Piran" }];
  assert.equal(choiceLabel("A", choices), "re: All-in Piran");
  assert.equal(choiceLabel("B", choices), "re: Trieste + Piran");
});

test("choiceLabel: unknown choiceId falls back to re: <raw id>", () => {
  assert.equal(choiceLabel("X", [{ id: "A", label: "Option A" }]), "re: X");
});

// ── diffEntries ──────────────────────────────────────────────────────────────
test("diffEntries: identical entries on same day → differs = false", () => {
  const a = [{ id: "1", day: "2026-05-21", title: "Piran walk" }];
  const b = [{ id: "2", day: "2026-05-21", title: "Piran walk" }];
  const diff = diffEntries(a, b);
  assert.equal(diff.length, 1);
  assert.equal(diff[0].differs, false);
  assert.equal(diff[0].day, "2026-05-21");
});

test("diffEntries: different titles on same day → differs = true (amber row)", () => {
  const a = [{ id: "1", day: "2026-05-21", title: "Piran walk" }];
  const b = [{ id: "2", day: "2026-05-21", title: "Trieste cafés" }];
  const diff = diffEntries(a, b);
  assert.equal(diff[0].differs, true);
});

test("diffEntries: entry on one side only → differs = true", () => {
  const a = [{ id: "1", day: "2026-05-21", title: "Piran walk" }];
  const b = [];
  const diff = diffEntries(a, b);
  assert.equal(diff.length, 1);
  assert.equal(diff[0].differs, true);
  assert.equal(diff[0].bEntry, null);
});

test("diffEntries: covers all days from both lists, sorted", () => {
  const a = [
    { id: "a1", day: "2026-05-21", title: "Piran" },
    { id: "a2", day: "2026-05-23", title: "Piran swim" },
  ];
  const b = [
    { id: "b1", day: "2026-05-22", title: "Trieste day" },
  ];
  const diff = diffEntries(a, b);
  assert.deepEqual(diff.map((d) => d.day), ["2026-05-21", "2026-05-22", "2026-05-23"]);
  assert.equal(diff[0].differs, true); // a only
  assert.equal(diff[1].differs, true); // b only
  assert.equal(diff[2].differs, true); // a only
});

test("diffEntries: empty lists → empty diff", () => {
  assert.deepEqual(diffEntries([], []), []);
});
