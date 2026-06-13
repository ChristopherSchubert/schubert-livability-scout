"use client";

// Board ⇄ Ranking view switch — the two lenses on the same candidate set.
// Shared so the two pages can't drift (icons, labels, a11y wiring live once).
// Pass the active view id ("board" | "ranking").

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

function RankingIcon() {
  // ranked bars (decreasing)
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="1" y="2" width="12" height="2.4" rx="1.2" fill="currentColor" />
      <rect x="1" y="5.8" width="8.5" height="2.4" rx="1.2" fill="currentColor" />
      <rect x="1" y="9.6" width="5" height="2.4" rx="1.2" fill="currentColor" />
    </svg>
  );
}

const VIEWS = [
  { id: "board", href: "/board", label: "Board", Icon: BoardIcon },
  { id: "ranking", href: "/ranking", label: "Ranking", Icon: RankingIcon },
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
    <div className="view-toggle" role="tablist" aria-label="Switch candidate view">
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
