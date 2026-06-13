"use client";

// TripVariations (#34) — the "Forks" tab: the deck's "what if" finale. Fork a
// date range into Option A / Option B, switch which one is live (the rest of
// the workspace follows via activeEntries), and watch the decide-by countdown
// (the earliest cancellation deadline across either option). Both futures stay
// alive until you pick one. Forking tags the in-range base entries to Option A
// implicitly (lib/trip-variations.activeEntries), so there's no per-entry
// write burst that could race the metadata (#62). Option B starts blank.
//
// Janice #8: each fork now has a shared Comments thread (Chris + Janice can
// both read and reply). Comments are stored in trip_fork_comments via RLS.
import { useEffect, useMemo, useRef, useState } from "react";
import { useTrips } from "./TripProvider";
import { useAuth } from "./AuthGate";
import { tripDays } from "../lib/trip";
import {
  tripForks, activeEntries, choiceCounts, forkDecideBy, makeFork, setActiveChoice, entriesForChoice,
} from "../lib/trip-variations";
import {
  fetchForkComments, addForkComment, removeForkComment,
} from "../lib/db";
import {
  commentsByChoice, authorLabel, leanEmoji, choiceLabel, diffEntries,
} from "../lib/fork-comments";

function daysUntil(ymd) {
  const m = (ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const target = new Date(+m[1], +m[2] - 1, +m[3]);
  const now = new Date();
  return Math.ceil((target - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}

// A single comment card.
function CommentCard({ comment, myUserId, choices, onRemove }) {
  const label = authorLabel(comment.authorId, myUserId, [], {});
  const optLabel = choiceLabel(comment.choiceId, choices);
  const emoji = leanEmoji(comment.lean);
  const isMine = comment.authorId === myUserId;
  return (
    <div className={`tfc-card${isMine ? " mine" : ""}`}>
      <div className="tfc-card-meta">
        <span className="tfc-author">{label}</span>
        <span className="tfc-opt-label">{optLabel}</span>
        {emoji && <span className="tfc-lean" title={comment.lean}>{emoji}</span>}
      </div>
      <p className="tfc-body">{comment.body}</p>
      {isMine && (
        <button className="tfc-delete" onClick={() => onRemove(comment.id)} title="Remove comment">×</button>
      )}
    </div>
  );
}

// The comments thread + composer for one fork.
function ForkComments({ trip, fork, myUserId }) {
  const [comments, setComments] = useState(null); // null = loading
  const [body, setBody] = useState("");
  const [targetChoice, setTargetChoice] = useState(""); // "" = general
  const [lean, setLean] = useState(""); // "" | "up" | "down"
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  // Load on mount.
  useEffect(() => {
    let cancelled = false;
    fetchForkComments(trip.id)
      .then((all) => {
        if (!cancelled) setComments(all.filter((c) => c.forkId === fork.id));
      })
      .catch((e) => { console.error("fetchForkComments:", e.message); if (!cancelled) setComments([]); });
    return () => { cancelled = true; };
  }, [trip.id, fork.id]);

  async function handleSend() {
    if (!body.trim() || sending || !myUserId) return;
    setSending(true);
    try {
      const saved = await addForkComment({
        tripId: trip.id,
        forkId: fork.id,
        choiceId: targetChoice || null,
        body: body.trim(),
        lean: lean || null,
        authorId: myUserId,
      });
      setComments((prev) => [...(prev || []), saved]);
      setBody("");
      setLean("");
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) {
      console.error("addForkComment:", e.message);
    } finally {
      setSending(false);
    }
  }

  async function handleRemove(id) {
    try {
      await removeForkComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      console.error("removeForkComment:", e.message);
    }
  }

  const grouped = comments ? commentsByChoice(comments) : {};

  return (
    <div className="tfc-wrap">
      <p className="tfc-heading">Comments</p>

      {comments === null ? (
        <p className="tfc-loading">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="tfc-empty">No comments yet — add yours below.</p>
      ) : (
        <div className="tfc-list">
          {comments.map((c) => (
            <CommentCard
              key={c.id}
              comment={c}
              myUserId={myUserId}
              choices={fork.choices}
              onRemove={handleRemove}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="tfc-composer">
        <textarea
          className="tfc-textarea"
          placeholder="Add a note for Chris or Janice…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
        />
        <div className="tfc-composer-row">
          <select
            className="tfc-target"
            value={targetChoice}
            onChange={(e) => setTargetChoice(e.target.value)}
            aria-label="Which option does this comment address?"
          >
            <option value="">general</option>
            {fork.choices.map((c) => (
              <option key={c.id} value={c.id}>re: {c.label}</option>
            ))}
          </select>
          <button
            className={`tfc-lean-btn${lean === "up" ? " active" : ""}`}
            onClick={() => setLean(lean === "up" ? "" : "up")}
            title="Lean toward this option"
            type="button"
          >👍</button>
          <button
            className={`tfc-lean-btn${lean === "down" ? " active" : ""}`}
            onClick={() => setLean(lean === "down" ? "" : "down")}
            title="Lean against this option"
            type="button"
          >👎</button>
          <button
            className="tfc-send"
            onClick={handleSend}
            disabled={!body.trim() || sending}
            type="button"
          >{sending ? "Sending…" : "Send"}</button>
        </div>
      </div>
    </div>
  );
}

// Side-by-side compare with diff highlight and make-active buttons.
function ForkCompare({ trip, fork, onPick }) {
  const aList = useMemo(() => entriesForChoice(trip, fork.id, fork.choices[0]?.id), [trip, fork]);
  const bList = useMemo(() => entriesForChoice(trip, fork.id, fork.choices[1]?.id), [trip, fork]);
  const diff = useMemo(() => diffEntries(aList, bList), [aList, bList]);

  // Count nights (distinct days in each choice).
  const aCnt = aList.length;
  const bCnt = bList.length;

  return (
    <div className="tv-compare">
      {fork.choices.map((c, idx) => {
        const isLive = fork.activeChoiceId === c.id;
        const list = idx === 0 ? aList : bList;
        const cnt = idx === 0 ? aCnt : bCnt;
        const otherCnt = idx === 0 ? bCnt : aCnt;
        return (
          <div key={c.id} className={`tv-col${isLive ? " live" : ""}`}>
            <header>
              {c.label}{isLive ? <i> · live</i> : null}
              {!isLive && (
                <button
                  className="tv-make-active"
                  onClick={() => onPick(fork.id, c.id)}
                  title={`Make ${c.label} the live plan`}
                >make live</button>
              )}
            </header>
            <p className="tv-col-trade">
              {cnt} {cnt === 1 ? "entry" : "entries"}
              {cnt !== otherCnt ? ` · ${cnt > otherCnt ? "+" : ""}${cnt - otherCnt} vs other` : ""}
            </p>
            {list.length === 0 ? (
              <p className="tv-col-empty">— empty —</p>
            ) : (
              <ul>
                {list.map((e) => {
                  const row = diff.find((d) => d.day === e.day);
                  return (
                    <li key={e.id} className={row?.differs ? "tv-col-diff" : ""}>
                      <span className="tv-col-day">{e.day?.slice(5)}</span>{" "}
                      {e.title || "Untitled"}
                      {e.booking?.cancelBy ? <em className="tv-col-by"> · by {e.booking.cancelBy}</em> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function TripVariations({ trip }) {
  const { updateTripFrame } = useTrips();
  const { userId } = useAuth();
  const forks = tripForks(trip);
  const days = useMemo(() => tripDays(trip), [trip]);
  const [name, setName] = useState("");
  const [from, setFrom] = useState(days[0]?.date || "");
  const [to, setTo] = useState(days[days.length - 1]?.date || "");

  function createFork() {
    const f = from || days[0]?.date, t = to || days[days.length - 1]?.date;
    if (!f || !t || f > t) return;
    const fork = makeFork(`fork-${Date.now()}`, name.trim(), f, t);
    // SINGLE atomic frame write — the in-range entries become Option A
    // implicitly (lib/trip-variations.activeEntries), so there's no per-entry
    // write burst that could land after the fork metadata and let another client
    // see the fork before its entries are tagged (#62). Option B starts blank.
    updateTripFrame(trip.id, { options: { ...(trip.options || {}), forks: [...forks, fork] } });
    setName("");
  }

  function pick(forkId, choiceId) {
    updateTripFrame(trip.id, { options: setActiveChoice(trip.options, forkId, choiceId) });
  }

  return (
    <div className="tv">
      <p className="tw-sec-label">What-if — fork a stretch of the trip into two futures, keep both alive until you're ready to choose.</p>

      {forks.map((f) => {
        const counts = choiceCounts(trip, f.id);
        const decideBy = forkDecideBy(trip, f.id);
        const left = decideBy != null ? daysUntil(decideBy) : null;
        return (
          <section key={f.id} className="tv-fork">
            <header className="tv-fork-head">
              <b>{f.name}</b>
              <span className="tv-range">{f.range.from} – {f.range.to}</span>
              {decideBy ? (
                <span className={`tv-decide${left != null && left <= 7 ? " soon" : ""}`}>
                  ⏰ cancel-by {decideBy}{left != null ? ` · ${left}d` : ""}
                </span>
              ) : <span className="tv-decide none">no refundable deadline yet</span>}
            </header>
            <div className="tv-choices">
              {f.choices.map((c) => (
                <button key={c.id} className={`tv-choice${f.activeChoiceId === c.id ? " on" : ""}`}
                        aria-pressed={f.activeChoiceId === c.id} onClick={() => pick(f.id, c.id)}>
                  <b>{c.label}</b>
                  <small>{counts[c.id] || 0} {(counts[c.id] || 0) === 1 ? "entry" : "entries"}</small>
                  {f.activeChoiceId === c.id ? <i className="tv-live">live</i> : null}
                </button>
              ))}
            </div>
            <p className="tv-hint">
              {f.activeChoiceId === f.choices[0]?.id
                ? `${f.choices[0]?.label} is live — these days show its plan. Switch to ${f.choices[1]?.label || "Option B"} and add entries on those days to build the alternative.`
                : `${f.choices.find((c) => c.id === f.activeChoiceId)?.label} is live — add entries on ${f.range.from}–${f.range.to} to fill it out.`}
            </p>

            {/* Side-by-side compare — both futures at once, live one ringed, diffs amber. */}
            <ForkCompare trip={trip} fork={f} onPick={pick} />

            {/* Shared comments thread (Janice #8). */}
            <ForkComments trip={trip} fork={f} myUserId={userId} />
          </section>
        );
      })}

      <section className="tv-new">
        <p className="tw-sec-label">Fork a date range</p>
        <div className="tv-form">
          <input className="tv-name" placeholder="name (e.g. Piran vs Trieste)" value={name} onChange={(e) => setName(e.target.value)} />
          <label>from <select value={from} onChange={(e) => setFrom(e.target.value)}>{days.map((d) => <option key={d.date} value={d.date}>{d.date}</option>)}</select></label>
          <label>to <select value={to} onChange={(e) => setTo(e.target.value)}>{days.map((d) => <option key={d.date} value={d.date}>{d.date}</option>)}</select></label>
          <button className="tv-create" onClick={createFork} disabled={!from || !to || from > to}>＋ Create fork</button>
        </div>
      </section>
    </div>
  );
}
