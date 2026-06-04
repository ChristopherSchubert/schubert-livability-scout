"use client";

import { useEffect, useRef, useState } from "react";

// Floating editorial chapter rail. Ports the mockup's scroll observer:
// highlights the chapter whose centerline is nearest the viewport's upper
// third, and only reveals itself once the reader has scrolled into the Why.
const CHAPTERS = [
  { id: "scene", num: "I", title: "The scene" },
  { id: "why", num: "II", title: "The why" },
  { id: "where", num: "III", title: "Where you'd live" },
  { id: "data", num: "IV", title: "By the numbers" },
  { id: "when", num: "V", title: "When to go" },
  { id: "walks", num: "VI", title: "Where to walk" },
];

export default function FloatingToc() {
  const [current, setCurrent] = useState("scene");
  const [visible, setVisible] = useState(false);
  const ticking = useRef(false);

  useEffect(() => {
    function update() {
      ticking.current = false;
      const mid = window.scrollY + window.innerHeight * 0.35;
      let best = CHAPTERS[0].id;
      let bestDist = Infinity;
      for (const ch of CHAPTERS) {
        const elx = document.getElementById(ch.id);
        if (!elx) continue;
        const r = elx.getBoundingClientRect();
        const top = window.scrollY + r.top;
        const bot = top + r.height;
        const dist = mid >= top && mid <= bot ? 0 : Math.min(Math.abs(top - mid), Math.abs(bot - mid));
        if (dist < bestDist) { bestDist = dist; best = ch.id; }
      }
      setCurrent(best);

      const why = document.getElementById("why");
      if (why) {
        const whyTop = window.scrollY + why.getBoundingClientRect().top;
        setVisible(window.scrollY >= whyTop - window.innerHeight * 0.7);
      }
    }
    function onScroll() {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(update);
    }
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
    };
  }, []);

  function jump(e, id) {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <aside className={`toc${visible ? " is-visible" : ""}`} aria-label="Chapters">
      {CHAPTERS.map((ch) => (
        <a
          key={ch.id}
          href={`#${ch.id}`}
          className={current === ch.id ? "is-current" : ""}
          onClick={(e) => jump(e, ch.id)}
        >
          <span className="num">{ch.num}</span>
          <span className="title">{ch.title}</span>
        </a>
      ))}
    </aside>
  );
}
