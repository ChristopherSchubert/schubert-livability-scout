"use client";

import { useState } from "react";
import { usePlanner } from "./PlannerProvider";

// Short human-readable date: "Jun 10" or "Jun 10, 2025" when not this year.
function fmtDate(isoStr) {
  const d = new Date(isoStr);
  const now = new Date();
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const m = months[d.getMonth()];
  const day = d.getDate();
  if (d.getFullYear() === now.getFullYear()) return `${m} ${day}`;
  return `${m} ${day}, ${d.getFullYear()}`;
}

const REACTIONS = [
  { key: "loved", emoji: "😍", label: "loved" },
  { key: "liked", emoji: "🙂", label: "liked" },
  { key: "mixed", emoji: "😐", label: "mixed" },
  { key: "no",    emoji: "🙁", label: "no" },
];

function ReactionBadge({ reaction }) {
  const r = REACTIONS.find(x => x.key === reaction);
  if (!r) return null;
  return <span className="jr-reaction-badge" title={r.label}>{r.emoji}</span>;
}

function EntryCard({ entry, cityId }) {
  const { editJournalEntry, removeJournalEntry } = usePlanner();
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(entry.body);
  const [editReaction, setEditReaction] = useState(entry.reaction || "");
  const [editAtPlace, setEditAtPlace] = useState(entry.atPlace || "");

  function handleEditSave() {
    editJournalEntry(cityId, entry.id, {
      body: editBody,
      reaction: editReaction,
      atPlace: editAtPlace,
    });
    setEditing(false);
  }

  function handleDelete() {
    if (window.confirm("Delete this journal entry?")) {
      removeJournalEntry(cityId, entry.id);
    }
  }

  if (editing) {
    return (
      <div className="jr-card jr-card-editing">
        <textarea
          className="jr-edit-textarea"
          value={editBody}
          onChange={e => setEditBody(e.target.value)}
          rows={4}
        />
        <div className="jr-reaction-row">
          {REACTIONS.map(r => (
            <button
              key={r.key}
              type="button"
              className={`jr-reaction-btn${editReaction === r.key ? " selected" : ""}`}
              onClick={() => setEditReaction(editReaction === r.key ? "" : r.key)}
              title={r.label}
            >
              {r.emoji}
            </button>
          ))}
        </div>
        <input
          className="jr-where-input"
          type="text"
          value={editAtPlace}
          onChange={e => setEditAtPlace(e.target.value)}
          placeholder="where? (the lake promenade…)"
        />
        <div className="jr-card-actions">
          <button className="jr-btn-save" onClick={handleEditSave} disabled={!editBody.trim()}>Save</button>
          <button className="jr-btn-cancel" onClick={() => { setEditing(false); setEditBody(entry.body); setEditReaction(entry.reaction || ""); setEditAtPlace(entry.atPlace || ""); }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="jr-card">
      <div className="jr-card-body">
        {entry.reaction && <ReactionBadge reaction={entry.reaction} />}
        <p className="jr-entry-text">{entry.body}</p>
      </div>
      <div className="jr-card-footer">
        {entry.atPlace && <span className="jr-at-place">📍 {entry.atPlace}</span>}
        <span className="jr-timestamp">{fmtDate(entry.createdAt)}</span>
        <div className="jr-card-controls">
          <button className="jr-btn-edit" onClick={() => setEditing(true)}>edit</button>
          <button className="jr-btn-delete" onClick={handleDelete}>delete</button>
        </div>
      </div>
    </div>
  );
}

export default function Journal({ cityItem }) {
  const { addJournalEntry } = usePlanner();
  const [body, setBody] = useState("");
  const [reaction, setReaction] = useState("");
  const [atPlace, setAtPlace] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave = body.trim().length > 0;

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    await addJournalEntry(cityItem.id, { body: body.trim(), reaction, atPlace: atPlace.trim() });
    setBody("");
    setReaction("");
    setAtPlace("");
    setSaving(false);
  }

  const entries = cityItem.journal ?? [];

  return (
    <div className="jr-wrap">
      <div className="jr-compose-card">
        <textarea
          className="jr-compose-textarea"
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="What's it like here, right now?"
          rows={4}
        />
        <div className="jr-reaction-row">
          {REACTIONS.map(r => (
            <button
              key={r.key}
              type="button"
              className={`jr-reaction-btn${reaction === r.key ? " selected" : ""}`}
              onClick={() => setReaction(reaction === r.key ? "" : r.key)}
              title={r.label}
            >
              {r.emoji}
            </button>
          ))}
        </div>
        <input
          className="jr-where-input"
          type="text"
          value={atPlace}
          onChange={e => setAtPlace(e.target.value)}
          placeholder="where? (the lake promenade…)"
        />
        <button
          className="jr-btn-primary"
          onClick={handleSave}
          disabled={!canSave || saving}
        >
          {saving ? "Saving…" : "Save entry"}
        </button>
      </div>

      <div className="jr-entries">
        {entries.length === 0 ? (
          <p className="jr-empty">No notes yet — jot your first impression above.</p>
        ) : (
          entries.map(entry => (
            <EntryCard key={entry.id} entry={entry} cityId={cityItem.id} />
          ))
        )}
      </div>
    </div>
  );
}
