"use client";

// Board ⇄ Compare view switch — the two lenses on the same set of places.
// Shared so the two pages can't drift (icons, labels, a11y wiring live once).
// Pass the active view id ("board" | "ranking"). The id/route stay "ranking"
// (no broken links) but the label reads "Compare" — the view sorts/filters
// places to explore by when they're good, not a ranking toward a verdict (#68).

import Link from "next/link";
import { useRef } from "react";
import { useRouter } from "next/navigation";

function BoardIcon() {
  // kanban columns
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="1" y="2" width="3.2" height="10" rx="1" fill="currentColor" />
      <rect x="5.4" y="2" width="3.2" height="7" rx="1" fill="currentColor" />
      <rect x="9.8" y="2" width="3.2" height="10" rx="1" fill="currentColor" />
    </svg>
  );
}

function CompareIcon() {
  // a small calendar grid — Compare is organized by when a place is good
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="1.2" y="2.2" width="11.6" height="10.4" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <line x1="1.2" y1="5.2" x2="12.8" y2="5.2" stroke="currentColor" strokeWidth="1.3" />
      <line x1="4" y1="1" x2="4" y2="3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="10" y1="1" x2="10" y2="3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <rect x="6.2" y="7" width="2.4" height="2.4" rx="0.5" fill="currentColor" />
    </svg>
  );
}

const VIEWS = [
  { id: "board", href: "/board", label: "Board", Icon: BoardIcon },
  { id: "ranking", href: "/ranking", label: "Compare", Icon: CompareIcon },
];

export default function ViewToggle({ active }) {
  const router = useRouter();
  const tabRefs = useRef([]);

  function handleKeyDown(e, index) {
    const count = VIEWS.length;
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % count;
    else if (e.key === "ArrowLeft") next = (index - 1 + count) % count;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = count - 1;

    if (next !== -1) {
      e.preventDefault();
      tabRefs.current[next]?.focus();
      router.push(VIEWS[next].href);
    }
  }

  return (
    <div className="view-toggle" role="tablist" aria-label="Switch place view">
      <span className="view-toggle-label" aria-hidden="true">View</span>
      {VIEWS.map(({ id, href, label, Icon }, index) => {
        const isActive = id === active;
        return (
          <Link
            key={id}
            href={href}
            ref={(el) => { tabRefs.current[index] = el; }}
            className={`view-toggle-tab${isActive ? " active" : ""}`}
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? "page" : undefined}
            tabIndex={isActive ? 0 : -1}
            title={`${label} view`}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            <Icon />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
