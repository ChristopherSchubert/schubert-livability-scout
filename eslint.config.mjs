// ESLint flat config (issue #52). eslint-config-next@16 ships a native flat
// config, so we spread it directly (no FlatCompat shim) and disable the
// formatting rules Prettier owns (eslint-config-prettier last). Lean by intent:
// this establishes the standard; rule tightening follows a clean baseline.
import next from "eslint-config-next/core-web-vitals";
import prettier from "eslint-config-prettier";

export default [
  { ignores: [".next/**", "node_modules/**", "coverage/**", "public/**"] },
  ...(Array.isArray(next) ? next : [next]),
  prettier,
  {
    // Introduce linting NON-BLOCKING: the repo predates ESLint, so these rules
    // (newer react-hooks lint + JSX entity escaping) start as warnings to keep
    // CI green while the ~40-finding baseline is burned down (tracked in #52).
    // Promote back to "error" once each is at zero — that's the ratchet.
    rules: {
      "react/no-unescaped-entities": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "import/no-anonymous-default-export": "warn",
    },
  },
];
