"use client";

import { useEffect, useState } from "react";
import PlanningMobile from "./PlanningMobile";
import TripPlanner from "./TripPlanner";

// Picks the planning surface by viewport: the pan/zoom swim-lane timeline
// (TripPlanner) on desktop, the simplified scannable list (PlanningMobile) on
// phones. Renders nothing until the width is known so there's no SSR/hydration
// mismatch and the heavy timeline never mounts on a phone.
export default function PlanningView() {
  const [isMobile, setIsMobile] = useState(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  if (isMobile === null) return null;
  return isMobile ? <PlanningMobile /> : <TripPlanner />;
}
