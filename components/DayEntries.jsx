"use client";

// DayEntries (#17) — a day's entries as a @dnd-kit sortable list. Drag the grip
// to reorder within the day; the new order persists via TripProvider.reorder
// (→ reorderEntries, sort = index). Both a PointerSensor (mouse/touch, 4px
// activation so a plain click still edits) and a KeyboardSensor (Tab to the
// grip, Space to lift, arrows to move, Space to drop) — the latter also
// delivers the keyboard drag the a11y pass (#38) deferred. The grip carries the
// listeners so the row body stays click-to-edit.
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import EntryRow from "./EntryRow";

function SortableRow({ e, onEdit, dietChips }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: e.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const handle = (
    <button className="tw-grip" {...attributes} {...listeners}
            onClick={(ev) => ev.stopPropagation()} aria-label={`Reorder ${e.title || "entry"}`}
            title="Drag to reorder (or focus + Space + arrows)">⠿</button>
  );
  return <EntryRow e={e} onEdit={onEdit} setNodeRef={setNodeRef} style={style} handle={handle} dietChips={dietChips} />;
}

export default function DayEntries({ tripId, day, list, onEdit, onReorder, dietChips }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = list.map((e) => e.id);

  function onDragEnd(ev) {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const next = arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id));
    onReorder(tripId, day, next);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="tw-entries">
          {list.map((e) => <SortableRow key={e.id} e={e} onEdit={onEdit} dietChips={dietChips} />)}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
