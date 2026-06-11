"use client";

// @dnd-kit drag foundation (issue #17) — one DndContext for all trip drag:
// pool → day (Gather→Block), reorder within a day, items between days. Every
// drop becomes a persisted patch via the handler the parent passes (which calls
// TripProvider writers). Accessible by default (keyboard + touch sensors).
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";

export default function TripDndContext({ children, onDrop }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor)
  );

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over) return;
    // Drop payloads are carried in data.current (set by the draggable/droppable):
    //   active.data.current = { type: "pool"|"entry", entry|option, fromDay? }
    //   over.data.current   = { type: "day"|"shelf", day? }
    onDrop?.({
      active: active.data.current || { id: active.id },
      over: over.data.current || { id: over.id },
    });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      {children}
    </DndContext>
  );
}
