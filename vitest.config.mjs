import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Vitest runs ONLY the React component tests (test/components/**/*.test.jsx) in
// jsdom. The pure-logic suites stay on zero-dep node:test (test/*.test.mjs) —
// `npm run test:unit`. `npm test` runs both. (#43)
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["test/components/**/*.test.jsx"],
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/components/setup.js"],
    css: false,
  },
});
