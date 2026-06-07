# Why prose

The editorial case for each city — a single 2-paragraph argument that
runs at the top of the detail page. The why is the only field on the
city written in the owner's voice; the rest is measured data.

## How it works today

- **Data**: `cities.why` (text). Hand-written per city; not derived
  from any source.
- **Render (live)**: shown on the city detail page above the metrics —
  `cityItem.why` paragraphs as a magazine-style chapter. Live in
  [components/PlannerShell.jsx](../components/PlannerShell.jsx)
  (`CityDetail`) and [components/city-detail/MagazineDetail.jsx](../components/city-detail/MagazineDetail.jsx)
  (`ChapterWhy`).
- **Render (mockup)**: chapter 2 of
  [public/city-detail-redesign.html](../public/city-detail-redesign.html) — same content,
  magazine typography (drop cap, wider measure).
- **Authoring rule**: 2-paragraph form, geography/fabric → case + honest
  tradeoff. End on the tradeoff. Set during the 2026-06-03 audit,
  re-enforced 2026-06-05 (typographic break required), and revised
  2026-06-06 (dropped the "you'd be testing…" closer that was reading
  as project-meta in 94/121 whys; same day, dropped `if_wins`/`if_fails`
  entirely — the gut-gate columns and their UI callout). Full style
  guide in the section below.

## Style guide — how to write a wonderful why

A why is a one-page editorial argument for a place. It is the only
field in the system written in the owner's voice, so it must sound
like a person who has actually thought about this — not a real-estate
listing, not a Wikipedia stub, not a ChatGPT travelogue.

If the why reads like it could be written about any one of forty similar
towns, it has failed. The job is to find the *thing that's only true of
this place* and lead with it.

### The form (two paragraphs — always)

A why has **two paragraphs separated by a blank line**, no exceptions.
Even short whys (under 700 chars) get the break. The 2026-06-05 audit
found 31 whys that had the right structural moves but no `\n\n` between
them — the reader's eye couldn't see the form working. If a why fits on
one screen, it still gets one paragraph break.

**Paragraph 1 — orientation.** Where the place is, what its geography
*does*, and what the walkable core actually looks like. Specific named
anchors (streets, institutions, businesses) but only ones you can
verify. End with the geographic context that matters (the mountains
behind, the water in front, the river through). Lead with the place
itself, not with a distance from somewhere else.

**Paragraph 2 — the case and the tradeoff.** The break falls right
before "The case is…" or "The case for [place] is…" — never
mid-orientation, never after the tradeoff. Two moves, in order:

1. *The case for [place] is…* — the argument, framed as the unique
   *combination* this place offers. Not "it's pretty" — combinations:
   "real walkable downtown + dramatic gorge geography + a major
   university keeping culture year-round" (Ithaca). The case is what
   would make this place a 9/10 if it lives up to it.
2. *The honest tradeoff is…* — the real downside, stated plainly. Not
   hedged, not balanced ("but also has wonderful…"). If the winter is
   brutal, say brutal. If it's been discovered and priced, say so.

End on the tradeoff. The why is editorial about the place; it doesn't
need to tell the reader what they'd be evaluating. Camden's why is
the model — orientation, case, tradeoff, done, no closer.

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
- **No meta-references to the project.** The why is about the place,
  full stop. Never mention "this database," "this app," "this tool,"
  "the dataset," "the owner," "the felt scale," "the measured metrics,"
  "calibration anchor," "control," "candidate," "regression target,"
  "the axes," or any other internal vocabulary. A reader landing on
  the city page should see editorial prose about a place, not a tour
  of the project's mechanics. This applies to every why — including
  the places used internally as anchors or controls. They get the
  same case/tradeoff form as everywhere else, written about the place
  itself.
- **No meta closer.** "You'd be testing whether…" / "What you'd be
  testing on the ground is…" frames the why as a project task and
  pushes the reader out of the place and into the evaluation. Drop it.
  Let the tradeoff land. (The 2026-06-03 audit baked this closer into
  the form; the 2026-06-06 audit removed it after 94/121 whys ended
  on the same construction.)

### Don't-do list (recurring failure modes)

- **The missing break.** Every why must have a blank line between
  paragraph 1 and paragraph 2. A single wall of prose hides the
  structure even when all three moves are there. Surfaced in the
  2026-06-05 audit (31 of 121 whys).
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
  actually part of the year-round case. Cohorts of lake-and-mountain
  candidates love to drop "X Mountain Y minutes north" as filler. If
  the place isn't a winter candidate, the ski line is noise.
- **Restating the case in the tradeoff.** "The case is a walkable
  Victorian downtown. The tradeoff is the walkable Victorian downtown
  is small." The tradeoff has to be a different *kind* of fact than
  the case — usually about season, price, scale, or the gap between
  what's marketed and what's lived.
- **Slovenia name-drops.** The Bled/Piran comparison is implicit in
  the whole project; it shouldn't show up by name in a why. Whys make
  their case on the place's own terms.

### Length

- **600–1200 chars** is the typical band; current median across the
  corpus is ~975. Don't aim at a target — let the place determine it.
- **Under 700** is fine when the place is small or simple (Camden ~580,
  Bled ~685, Greenport ~570). Short whys still get the paragraph break.
- **Over 1400** only when the place genuinely needs the room (Santa
  Barbara at 1592 earns it; most don't).

### Worked examples

The best models in the corpus right now:

- **Santa Barbara** — the geography-as-whole-story opener
- **Hudson** — distance only where it's load-bearing
- **Ithaca** — the unique-combination case
- **Northampton** — substantial walkable density argued without
  hyperbole
- **Camden** — short why done right (~580 chars, all of it earned)
- **Floyd, VA** and **Berea, KY** — small-town whys that lead with the
  one specific thing only that place has (the Friday Night Jamboree;
  the tuition-free craft college). The orientation paragraph names a
  single anchor and lets it carry the geography.

### Process for a new city

1. Read the city's Wikipedia entry and one local-paper feature, in
   that order. Note 3–5 specifics that are unique to *this* place.
2. Draft paragraph 1 from those specifics. If your draft could be
   pasted onto a different city in the same region with only the
   name changed, the draft has failed — try again.
3. Draft paragraph 2 with the case/tradeoff form. The case must name
   a combination; the tradeoff must be a different *kind* of fact than
   the case. End on the tradeoff — no project-facing closer.
4. Verify every named business, institution, and statistic. Cut
   any you can't confirm in under 30 seconds.

## Status

- **121/121 cities** have a why with ≥2 paragraphs (2026-06-05 audit).
  Length distribution: min 427, median 975, max 1592. The 31 single-
  paragraph whys surfaced in this audit all already had the right
  structural moves — orientation + "The case…" + "The tradeoff…" — and
  were fixed by inserting the missing `\n\n` at the pivot
  (`scripts/.split-paragraphs.mjs`).
- **No-meta-references audit (2026-06-06):** 11 whys (Bled, Piran,
  Ljubljana, Allison Park, Oakmont, Sewickley, Verona, Pittsburgh
  Lawrenceville, Pittsburgh Shadyside, plus tweaks on Honolulu Kaimuki
  and Petaluma) were rewritten to drop "in this database, X is the
  calibration anchor / control" framing. Every why now reads as
  editorial about the place, not a tour of the project.
- **Closer strip (2026-06-06):** the "You'd be testing whether…" closer
  was removed from 94 of 121 whys; paragraph 2 now lands on the
  tradeoff across the corpus.
- **`if_wins` / `if_fails` dropped (2026-06-06):** the gut-gate columns
  and the magazine-chapter callout were removed in migration 0007. Their
  framing duplicated the case/tradeoff and read as project-meta on the
  city page. The why now carries the entire editorial argument.

### Audit cadence

Run `node scripts/.audit-whys.mjs` after every onboarding batch. It
reports paragraph counts and length distribution and lists any why
that's still one paragraph. Re-run after rewrites until the 0-or-1-para
count is zero.

## TODOs / future direction

- **Reading-quality typography for the live route.** Mockup uses a drop
  cap and a wider measure — neither of which the live page does. Worth
  lifting when the magazine wire-up lands (see
  [magazine-detail.md](magazine-detail.md)).
- **Versioning.** Every why edit overwrites the prior version. If the
  owner reframes a place mid-evaluation, the old framing is lost. A
  simple `why_history` jsonb append-only column would keep the audit
  trail.
- **No source rule still applies.** Why is editorial, not measured —
  belongs in `cities` as user content, not in `measured_metrics`. Watch
  for drift if anyone tries to "derive" a why from metrics.
