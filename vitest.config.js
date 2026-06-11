import { defineConfig } from "vitest/config";

// Test harness for the trip planner + domain logic (issue #40). Node is the
// default environment (the lib/* engines are pure + isomorphic); component
// tests opt into jsdom with a `// @vitest-environment jsdom` file header.
// Coverage targets the domain engines the trip planner rests on (≥95%, #41);
// React components/routes come online as they're built (#43).
export default defineConfig({
  // Automatic JSX runtime (React 19) so component tests don't need a React
  // import in scope — matches how Next compiles JSX.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.{test,spec}.{js,jsx}"],
    setupFiles: ["tests/setup.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.js"],
      // The engines the trip planner rests on (issue #41): statements/lines held
      // ≥95%; branch floors set a couple points under what the suite actually
      // achieves (defensive ??/|| guards make 100% branches not worth the
      // contortion) so the gate is meaningful without flaking. Other lib files
      // join as they get tests (#42–#43).
      thresholds: {
        "lib/trip.js": { statements: 95, branches: 80, functions: 90, lines: 95 },
        "lib/solve.js": { statements: 95, branches: 88, functions: 95, lines: 95 },
        "lib/sourcing.js": { statements: 95, branches: 90, functions: 95, lines: 95 },
        "lib/solve-adapter.js": { statements: 95, branches: 70, functions: 95, lines: 95 },
      },
    },
  },
});
