# Why prose (why / if-wins / if-fails)

Three short prose fields on every city — the case for the place, plus
the gut gates that decide whether a visit confirmed or refuted it.
The "why" is the editorial pitch; "if wins" and "if fails" are the
sentences you write *before* the trip so post-trip rationalization
doesn't move the goalposts.

## How it works today

- **Data**: `cities.why`, `cities.if_wins`, `cities.if_fails` (text).
  Hand-written per city; not derived from any source.
- **Render (live)**: shown on the city detail page above the metrics —
  `cityItem.why` paragraphs, then a callout with "If it wins" and
  "If it fails". Live in
  [components/PlannerShell.jsx](../components/PlannerShell.jsx) (`CityDetail`).
- **Render (mockup)**: chapter 2 of
  [public/city-detail-redesign.html](../public/city-detail-redesign.html) — same content,
  magazine typography (drop cap, wider measure).
- **Authoring rule**: 2-paragraph form, geography/fabric → case + honest
  tradeoff + "you'd be testing…" closer. Set during the 2026-06-03 audit
  (TODO #5). Full style guide in the section below.

## Style guide — how to write a wonderful why

A why is a one-page editorial argument for a place, ending in the question
the trip will answer. It is the only field in the system written in the
owner's voice, so it must sound like a person who has actually thought
about this — not a real-estate listing, not a Wikipedia stub, not a
ChatGPT travelogue.

If the why reads like it could be written about any one of forty similar
towns, it has failed. The job is to find the *thing that's only true of
this place* and lead with it.

### The form (two paragraphs)

**Paragraph 1 — orientation.** Where the place is, what its geography
*does*, and what the walkable core actually looks like. Specific named
anchors (streets, institutions, businesses) but only ones you can
verify. End with the geographic context that matters (the mountains
behind, the water in front, the river through). Lead with the place
itself, not with a distance from somewhere else.

**Paragraph 2 — the case, the tradeoff, the closer.** Three moves, in
order:

1. *The case for [place] is…* — the argument, framed as the unique
   *combination* this place offers. Not "it's pretty" — combinations:
   "real walkable downtown + dramatic gorge geography + a major
   university keeping culture year-round" (Ithaca). The case is what
   would make this place a 9/10 if it lives up to it.
2. *The honest tradeoff is…* — the real downside, stated plainly. Not
   hedged, not balanced ("but also has wonderful…"). If the winter is
   brutal, say brutal. If it's been discovered and priced, say so.
3. *You'd be testing whether…* — the closer. Turns the why into the
   question the visit will answer. This is the sentence that makes the
   trip falsifiable.

### Voice rules

- **Declarative, no hedging.** "That geography is the whole story."
  "The plan is the magic." Confident sentences. No "perhaps,"
  "arguably," "some might say."
- **Specific over decorative.** "Seventy-plus cafés in a half-mile
  radius" beats "lively café scene." "Smith College + the Five
  Colleges put 30,000 students within ten miles" beats "vibrant
  college town."
- **Concrete anchors, all verifiable.** If you name a bookstore,
  brewery, theater, or institution, it must exist. Under the no-fake-
  data rule, an invented business in a why is the same sin as a
  hallucinated metric. When in doubt, cut the name.
- **One photogenic detail per paragraph, max.** Spanish moss on the
  oaks. Cobblestones in the Old Port. Two is decoration; one is voice.
- **No real-estate adjectives.** *charming, quaint, hidden gem,
  picturesque, vibrant, bustling.* These are filler that any town can
  steal. Replace each with the specific thing that earned the adjective,
  or cut it.

### Don't-do list (the failure modes the 2026-06-04 cohort showed)

- **The locked template.** "Town of N people at K feet, M hours from
  Pittsburgh, with Main Street businesses and ski mountain X minutes
  away." Twelve cities in a row with the same skeleton means the
  skeleton is the writer, not the place.
- **Reflex distance-from-Pittsburgh.** Most cities don't need it. It
  earns its place only when the distance is actually load-bearing
  (Hudson is "two hours by train from NYC" because the train is the
  story; Asheville doesn't mention Pittsburgh at all). Cities 7+ hours
  away aren't testable as weekend trips — saying so doesn't help.
- **Reflex ski-mountain reference.** Only mention skiing if it's
  actually part of the year-round case. Half the 2026-06-04 cohort
  had a "X Mountain Y minutes north" line as filler. If the place
  isn't a winter candidate, the ski line is noise.
- **Restating the case in the tradeoff.** "The case is a walkable
  Victorian downtown. The tradeoff is the walkable Victorian downtown
  is small." The tradeoff has to be a different *kind* of fact than
  the case — usually about season, price, scale, or the gap between
  what's marketed and what's lived.
- **Slovenia name-drops.** The Bled/Piran comparison is implicit in
  the whole project; it shouldn't show up by name in a why unless it
  earns the comparison structurally (Camden does, in `if_wins`). Most
  whys should make their case on the place's own terms.

### Length

- **600–1200 chars** for typical cities. 800–1000 is the sweet spot.
- **Under 700** is fine when the place is small or simple (Camden at
  580, Bled at 685). Don't pad to hit a target.
- **Over 1400** only when the place genuinely needs the room (Santa
  Barbara at 1592 earns it; most don't).

### if_wins / if_fails (the gut gates)

One sentence each. Written *before* the trip so post-trip
rationalization can't move the goalposts.

- **if_wins**: the specific lived-experience claim that, if true, makes
  this place a buy. Name the combination, not just an attribute.
  Good: "Hills + harbor + walkable downtown — the closest Maine analog
  to Bled." Bad: "Beautiful Maine town with great walking."
- **if_fails**: the specific way the place could collapse in person.
  Name the failure mode you actually fear. Good: "Off-season hollows
  out; winter is too long." Bad: "Doesn't live up to expectations."

These should not restate the case/tradeoff from paragraph 2 — they
sharpen them into a yes/no the visit produces.

### Calibration anchors are different

The 9 anchors (Bled, Piran, Sewickley, Allison Park, Pittsburgh
neighborhoods used as controls, etc.) get a different form: a short
orientation paragraph and an explicit "in this database, X isn't a
candidate, it's the [anchor/control]" paragraph. Don't apply the
case/tradeoff/closer form to them — they aren't being tested.

### Worked examples

The best models in the corpus right now:

- **Santa Barbara** — the geography-as-whole-story opener
- **Hudson** — distance only where it's load-bearing
- **Ithaca** — the unique-combination case
- **Northampton** — substantial walkable density argued without
  hyperbole
- **Camden** — short why done right (580 chars, all of it earned)

The cohort that needs rewriting (the 2026-06-04 12) is the inverse:
read those side-by-side with Camden to see how the template flattens
specificity.

### Process for a new city

1. Read the city's Wikipedia entry and one local-paper feature, in
   that order. Note 3–5 specifics that are unique to *this* place.
2. Draft paragraph 1 from those specifics. If your draft could be
   pasted onto a different city in the same region with only the
   name changed, the draft has failed — try again.
3. Draft paragraph 2 with the case/tradeoff/closer form. The case
   must name a combination; the tradeoff must be a different *kind*
   of fact than the case; the closer must be falsifiable.
4. Verify every named business, institution, and statistic. Cut
   any you can't confirm in under 30 seconds.
5. Write `if_wins` and `if_fails` as gut gates, not summaries.

## Status

- All 78 candidate cities have whys in the 800–1600 character band (the
  audit's target).
- The 9 calibration/benchmark places (Pittsburgh-area controls + Slovenia
  originals) keep their short whys — intentional, not a gap.
- `if_wins` / `if_fails` are populated unevenly — present on the cities
  that have made it past Shortlist; absent on early candidates.

## TODOs / future direction

- **Reading-quality typography for the live route.** Mockup uses a drop
  cap, a wider measure, and small caps on "If it wins" — none of which
  the live page does. Worth lifting when the magazine wire-up lands
  (see [magazine-detail.md](magazine-detail.md)).
- **`if_wins` / `if_fails` prompt on stage change.** When the owner moves
  a city to Shortlist, surface a small modal that asks for these two
  sentences if they're blank — easier than a separate authoring pass
  and prevents trips that don't have a gate to fail.
- **Versioning.** Every why edit overwrites the prior version. If the
  owner reframes a place mid-evaluation, the old framing is lost. A
  simple `why_history` jsonb append-only column would keep the audit
  trail.
- **No source rule still applies.** Why is editorial, not measured —
  belongs in `cities` as user content, not in `measured_metrics`. Watch
  for drift if anyone tries to "derive" a why from metrics.
