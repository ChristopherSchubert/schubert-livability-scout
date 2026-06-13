// #54 — date-only values must render on the right day regardless of host TZ.
// parseDateLocal builds a LOCAL Date, so getDate()/formatting can't drift to the
// previous day the way `new Date("2026-08-05")` (UTC midnight) does for US users.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDateLocal, formatDateRange, nightsBetween } from "../lib/date-fmt.js";

test("parseDateLocal: a date-only string is the SAME calendar day in any TZ", () => {
  const d = parseDateLocal("2026-08-05");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 7);  // August
  assert.equal(d.getDate(), 5);   // not the 4th — this is the whole bug
});

test("formatDateRange: 2026-08-05 → 2026-08-08 renders 'Aug 5 – 8'", () => {
  assert.equal(formatDateRange("2026-08-05", "2026-08-08", "en-US"), "Aug 5 – 8");
});

test("formatDateRange: cross-month + single date", () => {
  assert.equal(formatDateRange("2026-08-30", "2026-09-02", "en-US"), "Aug 30 – Sep 2");
  assert.equal(formatDateRange("2026-08-05", null, "en-US"), "Aug 5");
  assert.equal(formatDateRange(null, "2026-08-08", "en-US"), "");
});

test("parseDateLocal: full ISO timestamps pass straight through", () => {
  const d = parseDateLocal("2026-06-13T10:00:00Z");
  assert.equal(d.getTime(), new Date("2026-06-13T10:00:00Z").getTime());
  assert.equal(parseDateLocal("not a date"), null);
  assert.equal(parseDateLocal(""), null);
});

test("nightsBetween: whole nights, TZ-safe", () => {
  assert.equal(nightsBetween("2026-08-05", "2026-08-08"), 3);
  assert.equal(nightsBetween("2026-08-05", null), null);
});
