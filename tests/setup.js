// Vitest setup (issue #40). jest-dom matchers are loaded for the component
// tests that run under jsdom; harmless for the node-environment engine tests.
import "@testing-library/jest-dom/vitest";
