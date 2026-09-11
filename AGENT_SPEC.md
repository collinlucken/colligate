# Weft: build spec for Replit Agent

Paste this whole file as the first message to Replit Agent, in **Plan mode**. Read the plan it
produces. Then switch to Build mode and say "Build Stage 1." Upload the three data files first
(see "Files provided" below) so Agent can read them.

Working name: **Weft**. Rename everywhere if a different name is chosen.

---

## What we are building

A single-page web app for making **concept maps that the software can reason about**. A map is
not a drawing. It is a list of **propositions** (subject, relation, object), each of which reads as
a sentence, plus a picture generated from that list. Because the list is structured, the app can
compute the map's shape, derive what the map implies, and compare two maps exactly.

**Hard rule: no AI inside the product.** No language-model calls, no external AI API, no ML.
Every piece of feedback is produced by a deterministic rule over the graph, and every piece of
feedback has a "show your work" disclosure that prints the rule and the inputs that fired it.
(Using Agent to build the app is fine. The app itself never calls a model.)

## Files provided (upload to the project root under `data/`)

- `data/phil2400-f26.pack.json` The **domain pack** for one course: 152 concepts with labels,
  aliases, and types; 33 **relation types** with logical properties; an alias table; units; sources.
  The app loads this at startup. Do not hand-edit it.
- `data/sept2-expert.map.txt` and `.json` An instructor map in **sentence form** and in native JSON.
- `data/student-demo.map.txt` and `.json` A student map that exercises every engine feature.
- `data/expected-outputs.json` What the engine must report for those two maps. Use it as a test fixture.
- `data/HELP.md` The text of the in-app Help page (one section for students, one for instructors).
  Render it as-is; do not rewrite it.

## Data model (TypeScript types; keep these exact field names)

```ts
type Concept = { id: string; label: string; aliases: string[]; type: string;
  definition?: string; external_ids: Record<string,string>; tags: string[]; pack_id: string | null };
type RelationType = { id: string; label: string; inverse_label: string | null; family: string;
  directed: boolean; symmetric: boolean; transitive: boolean; incompatible_with: string[];
  subject_types: string[]; object_types: string[]; hierarchy_weight: -1 | 0 | 1; description: string };
type Proposition = { id: string; subject: string; relation: string | { free: string }; object: string;
  confidence: 1|2|3|4|5 | null; justification: string | null; anchors: {source_id: string; locator?: string}[];
  learned_at: string; holds_from: string | null; holds_to: string | null;
  status: "asserted" | "implied" | "disputed" | "retracted"; derived_from: string[] | null };
type MapDoc = { id: string; title: string; focus_question: string; genre: "concept";
  pack_id: string; concepts: Pick<Concept,"id"|"label"|"type"|"pack_id">[]; propositions: Proposition[];
  layout: Record<string,{x:number;y:number}>; submaps: Record<string,string>;
  meta: { created_at: string; last_saved_at: string; session_seconds: number; edit_count: number;
          added_by: { typed: number; drawn: number; accepted_inference: number } } };
```

Identity is the `id`, never the label. `subject_types`/`object_types` empty means "any type".
Concept types in this pack: `core-concept`, `research-paradigm`, `system-or-example`, `figure`, `text`.

## Sentence form (must parse and print; one proposition per line)

```
? focus question goes on a line starting with a question mark
Subject -> relation label -> Object  @3  [source-id 15]  // justification
# comment
```
Only the three `->` parts are required. `@n` is confidence 1 to 5. `[source-id page]` is an anchor.
Subject and Object are matched against pack concept labels **and aliases**, case-insensitive,
whitespace-collapsed. A relation label is matched against the pack's relation `label`, its
`inverse_label` (in which case swap subject and object and store the forward relation), and the
pack's `alias_table.relations`. Anything unmatched: a concept becomes a **novel** concept
(marked, allowed); a relation becomes `{free: "text"}` (marked, allowed). Never block the user.

## Process evidence (cheap, and required)

The map records its own construction. Two rules:

- **`learned_at` is set once, when a proposition first appears, and is never overwritten.** On every
  re-parse of the sentence view, match propositions by (subject, relation, object) to the previous
  state and carry the old `learned_at` forward; only genuinely new triples get the current time.
  Consequence: fifteen lines pasted at once share one timestamp; a map built over forty minutes does not.
- **`meta` accumulates across sessions and is saved in the file.** `session_seconds` counts time
  while the tab is visible and the map has changed in the last five minutes. `edit_count` increments on
  every add, remove, relabel, or node move. `added_by` counts how each proposition entered the map.
  Show `meta` in a small "About this map" line under the title (e.g. "14 propositions, built over
  38 min in 3 sessions, 61 edits"). Instructors read this when a file is loaded.

## The engine: a pure module, `src/engine/`, no I/O, no DOM, no fetch

Each function returns a result **and** a `derivation: string[]` explaining it.

1. `parseSentences(text, pack) -> MapDoc` and `printSentences(map, pack) -> string`. Round-trip must
   preserve every proposition.
2. `diagnoseStructure(map, pack)` returns: concept count, proposition count, connected components,
   independent cycles (propositions minus concepts plus components), diameter, hub concept and its
   degree, `spoke` = hub degree / proposition count, `chain` = fraction of concepts with degree 2,
   orphans (degree 0), free-text relations, weak relations (`is-related-to`), density, and a label:
   `network` if cycles ≥ 1 or a cross-link exists, else `spoke` if spoke ≥ 0.5, else `chain` if
   chain ≥ 0.5, else `tree`. Cross-link: a proposition whose two concepts sit in different branches
   below the root, where "down" edges are those with `hierarchy_weight` +1 (subject above object) or
   −1 (object above subject).
3. `infer(map, pack)` applies only the pack's relation properties:
   transitivity (A r B, B r C ⇒ A r C, to closure); inheritance (A r B and B `is-a-kind-of` C ⇒ A r C
   when r is in `pack.inference.inheritable_relations`); incompatibility (A r B and A s B where s ∈
   r.incompatible_with ⇒ conflict); type check (subject/object type not permitted ⇒ ill-typed);
   taxonomic cycle (A r A via a transitive relation ⇒ conflict). Returns `{implied, conflicts, illTyped}`,
   each item with its derivation.
4. `compare(student, reference, pack)` treats both as sets of (subject, relation, object) triples
   after alias resolution and returns: shared, only-in-student (novel), only-in-reference (gaps),
   **disputes** (same unordered concept pair, different relation), recall, precision, F1, and
   **Goldsmith closeness** (for each concept in either map, Jaccard of its neighbour sets in the two
   maps; average). Never call anything "wrong": label them coverage and difference.

`data/expected-outputs.json` holds the correct results for both provided maps. Write a test that
loads the two maps and asserts those numbers.

## The interface (one screen, three columns)

- **Left: sentence view.** A textarea holding the map in sentence form. Editing it re-parses
  (debounced 300 ms) and updates the canvas. Unresolved concepts and free relations get a marker.
- **Center: canvas.** Nodes are concepts, colored by type: core-concept blue, research-paradigm red,
  system-or-example green, figure grey, text amber. Edges are labeled with the relation label.
  Implied propositions render as dashed grey edges with a "?" badge. Drag to move (positions
  persist in `layout`). Click two nodes then pick a relation from a **picker grouped by family** to
  add a proposition; the sentence view updates. Free-text relation field as the escape hatch.
  Auto-layout button (top-down, using hierarchy_weight to orient). Use React Flow or any canvas
  library that ships as a plain dependency; render our own SVG for export.
- **Right: three panels.**
  - **Structure:** the diagnostics above, as observations with a suggestion, never a grade.
    Example: "Shape: tree. No cross-links. Your Dennett branch and your formal-systems branch never
    touch." Do not propose a relation; only name the two branches.
  - **Implications:** each implied proposition in words, with three buttons: **Accept** (adds it as
    asserted, `derived_from` filled), **Fix** (highlights the propositions that produced it), **Except**
    (requires a one-sentence justification, stores the proposition as `status: "disputed"`).
    Conflicts and ill-typed propositions listed below, both propositions highlighted on click.
  - **Compare:** load a reference map file; show shared / gaps / novel / disputes and the numbers.
- **Every number and every message has a "show your work" toggle** that prints the derivation.
- Top bar: focus question field, pack name, concept-bank search (chips; drag onto canvas adds a
  node), **Load pack**, Load map, Save map (JSON download), Export SVG, **Help**.
- **Load pack** replaces the current pack with a pack JSON file the user chooses. The concept bank,
  relation picker, alias table, and type colors all re-render from the new pack. The PHIL 2400 pack
  is only the default that ships with the app; the tool is for any course. Persist the loaded pack
  in `localStorage` with the map.
- **Help** opens a page rendered from `data/HELP.md`, with a "For students" and a "For instructors"
  tab. Static content, plain typography, printable.
- **Empty-map welcome message** (shown on the canvas when a map has no propositions). Use this text
  exactly: *"You build this yourself. Making a map produces substantially more learning than
  studying a finished one (Schroeder et al. 2018), and the reason is old: you understand what you can
  make. That is why the tool never draws a link for you, and why your instructor's map stays hidden
  until you have made your own."* Followed by a link: "Why? Read about maker's knowledge in Help."
- **Footer line**, always visible, small type: "Built on the maker's knowledge principle. No AI inside.
  Every judgment has a show-your-work button." 
- Persist the current map to `localStorage` on every change.

## Stages (build in this order; each stage must be demoable before the next starts)

- **Stage 1.** Load the pack (default file, then via the Load pack button). Sentence view ↔ canvas,
  both directions. Load `sept2-expert.map.txt` and see 15 nodes and 14 edges. Concept bank chips.
- **Stage 2.** Structure panel with show-your-work. Auto-layout. Help page from `data/HELP.md`.
- **Stage 3.** Implications panel with accept / fix / except. Load `student-demo.map.txt`: it must
  show 3 implied propositions, 1 conflict, 1 ill-typed proposition (see expected-outputs).
- **Stage 4.** Compare panel: student vs. expert shows 4 shared, 8 novel, 10 gaps, 3 disputes.
- **Stage 5 (only if time).** SVG export; relation picker polish; Vitest for the engine.

## Non-goals for this session

No accounts, no server, no database, no sync, no PDF, no flashcards, no nesting, no AI anywhere.
