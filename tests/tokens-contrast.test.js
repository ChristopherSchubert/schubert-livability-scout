// Entry-kind color contrast (issues #16, #38). The spec (§2) targets every kind
// hue at ≥ WCAG AA 4.5:1 on --bg and says "verify, don't assume" — the same bar
// that caught --muted at 4.39:1 in 2026-06-09. This computes the REAL ratios
// from app/trips.css so a future token edit can't silently regress contrast.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BG = "#fbf6ea"; // --bg (app/globals.css)

function srgbToLin(c) {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// Pull the text-bearing kind tokens straight from the stylesheet.
const css = readFileSync(join(ROOT, "app/trips.css"), "utf8");
function token(name) {
  const m = new RegExp(`--kind-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  return m?.[1] || null;
}

describe("entry-kind colors clear WCAG AA (4.5:1) on --bg", () => {
  // -fill variants are decorative; --kind-flexible reuses the already-verified
  // --muted. These five carry text (spec §2 table).
  for (const name of ["booked", "meal", "travel", "checkin", "todo"]) {
    it(`--kind-${name} ≥ 4.5:1`, () => {
      const hex = token(name);
      expect(hex, `--kind-${name} present in app/trips.css`).toBeTruthy();
      const ratio = contrast(hex, BG);
      expect(ratio, `--kind-${name} (${hex}) = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("the contrast math agrees with a known pair (black on white = 21:1)", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });
});
