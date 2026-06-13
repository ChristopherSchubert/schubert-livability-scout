// Fork-comments helpers (#34 / Janice feedback #8). Pure, isomorphic — no
// Supabase imports here so this file is unit-testable without a browser client.
//
// A comment row: { id, tripId, forkId, choiceId, authorId, body, lean, createdAt }
//   choiceId: null = general comment on the fork as a whole
//   lean: 'up' | 'down' | null

// Shape a DB row → app comment object.
export function rowToForkComment(r) {
  return {
    id: r.id,
    tripId: r.trip_id,
    forkId: r.fork_id,
    choiceId: r.choice_id || null,
    authorId: r.author_id,
    body: r.body || "",
    lean: r.lean || null,
    createdAt: r.created_at || null,
  };
}

// Shape an app comment patch → DB insert row.
export function forkCommentToRow(comment) {
  return {
    trip_id: comment.tripId,
    fork_id: comment.forkId,
    choice_id: comment.choiceId || null,
    author_id: comment.authorId,
    body: comment.body,
    lean: comment.lean || null,
  };
}

// Group comments by choiceId: returns { [choiceId]: comments[], null: comments[] }.
// null key holds general (no choice) comments.
export function commentsByChoice(comments) {
  const out = {};
  for (const c of comments || []) {
    const key = c.choiceId ?? null;
    (out[key] ||= []).push(c);
  }
  return out;
}

// Resolve a human label for an author given the trip's travelers list.
// travelers = [{ name, kind }] as stored in trips.travelers.
// Falls back to "You" for the logged-in user (authorId === myUserId) and
// "Them" for any unknown author.
export function authorLabel(authorId, myUserId, travelers, profiles) {
  // profiles is an optional { [userId]: displayName } map (from profiles table).
  if (profiles && profiles[authorId]) return profiles[authorId];
  if (authorId === myUserId) return "You";
  // Try travelers array by position: the other traveler is "Them" unless named.
  if (travelers && travelers.length) {
    // The trip owner's traveler slot is conventionally first; the other is second.
    // We can't map uuid→traveler index reliably here without extra data, so fall
    // through to "Them" when profiles is missing.
  }
  return "Them";
}

// Lean emoji helper.
export function leanEmoji(lean) {
  if (lean === "up") return "👍";
  if (lean === "down") return "👎";
  return null;
}

// A label for what a comment is "about": re: <choiceLabel> or "general".
// choices = [{ id, label }] from the fork.
export function choiceLabel(choiceId, choices) {
  if (!choiceId) return "general";
  const c = (choices || []).find((x) => x.id === choiceId);
  return c ? `re: ${c.label}` : `re: ${choiceId}`;
}

// Day-aligned diff between two entry lists (from entriesForChoice).
// Returns an array of { day, aEntry?, bEntry?, differs: boolean } rows covering
// all days that appear in either list. A row differs when a vs b have different
// titles, or one side is empty. Used to highlight amber in the compare grid.
export function diffEntries(aEntries, bEntries) {
  const allDays = [...new Set([...aEntries.map((e) => e.day), ...bEntries.map((e) => e.day)])].sort();
  return allDays.map((day) => {
    const aEntry = aEntries.find((e) => e.day === day) || null;
    const bEntry = bEntries.find((e) => e.day === day) || null;
    const differs = !aEntry || !bEntry || (aEntry.title || "") !== (bEntry.title || "");
    return { day, aEntry, bEntry, differs };
  });
}
