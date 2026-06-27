"use client";

// Three-state theme picker: system / light / dark (#95).
// - Persists via a `theme` cookie read server-side in app/layout.js for
//   first-paint matching (no flash).
// - Removes data-theme entirely when "system" is picked so the OS preference
//   media query takes over (per globals.css :root:not([data-theme="light"])).

import { useEffect, useState } from "react";

function readTheme() {
  if (typeof document === "undefined") return "system";
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "light" || explicit === "dark") return explicit;
  return "system";
}

function applyTheme(next) {
  const html = document.documentElement;
  if (next === "system") {
    html.removeAttribute("data-theme");
    // 1-year max-age + path=/; SameSite=Lax so it carries on same-site nav.
    document.cookie = "theme=; Path=/; Max-Age=0; SameSite=Lax";
  } else {
    html.setAttribute("data-theme", next);
    document.cookie = `theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }
}

const OPTIONS = [
  { value: "system", label: "Auto", desc: "Match the OS" },
  { value: "light",  label: "Light", desc: "Warm paper" },
  { value: "dark",   label: "Dark",  desc: "Crest night" },
];

export default function ThemeToggle() {
  const [theme, setTheme] = useState("system");
  useEffect(() => { setTheme(readTheme()); }, []);

  function pick(value) {
    applyTheme(value);
    setTheme(value);
  }

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Theme">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          className={`theme-toggle-opt ${theme === o.value ? "is-active" : ""}`}
          onClick={() => pick(o.value)}
          title={o.desc}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
