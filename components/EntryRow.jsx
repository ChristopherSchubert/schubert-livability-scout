"use client";

// EntryRow — one entry as a row in the Days agenda. Composes the display atoms
// (#21). Accepts optional drag props (setNodeRef/style/handle) so the same row
// renders both statically and as a @dnd-kit sortable item (#17) — the grip
// handle carries the drag listeners while the row body stays click-to-edit.
import { CatIcon, TimeChip, BookingBadge, CostTag, MarkerSet } from "./atoms";

export default function EntryRow({ e, onEdit, setNodeRef, style, handle }) {
  return (
    <li ref={setNodeRef} style={style}
        className={`tw-entry cat-${e.category || "activity"}`} onClick={() => onEdit(e)}
        role="button" tabIndex={0} aria-label={`Edit ${e.title || "entry"}`} title="Edit entry"
        onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onEdit(e); } }}>
      {handle || null}
      <TimeChip entry={e} />
      <CatIcon cat={e.category} />
      <span className="tw-title">{e.title}{e.place ? <em className="tw-place"> · {e.place.name}</em> : null}</span>
      <span className="tw-tags">
        <BookingBadge status={e.status} />
        <CostTag cost={e.cost} />
        <MarkerSet markers={e.markers} />
      </span>
    </li>
  );
}
