# Expected outputs (verified with tools/reference_engine.py)

Use this to check each stage in under a minute. The machine-readable version is
`maps/expected-outputs.json`. Labels below are the pack's canonical labels; the app may display
aliases as typed (for example "Embodied AI" for "Embodied and embedded AI", "Dennett" for
"Daniel Dennett").

## Loading `sept2-expert.map.txt` (Stage 1)

| Check | Expected |
|---|---|
| Concepts | 15, all resolved from the pack, none novel |
| Propositions | 14, none free-text (the whiteboard labels resolve through the alias table) |
| Focus question | What is mind design? |
| Inverse handling | "Neural Networks gave rise to Connectionism" is stored as Connectionism `developed-from` Neural networks. "Embodied AI has as an example Roomba" is stored as Roomba `is-an-example-of` Embodied and embedded AI. |
| Alias handling | "applies to" becomes `is-applicable-to`; "is for manipulating" becomes `operates-on` |

## Structure panel on the expert map (Stage 2)

| Measure | Expected |
|---|---|
| Components | 1 |
| Independent cycles | 0 (14 − 15 + 1). It is a tree. |
| Diameter | 9 (Tokens to Mind) |
| Hub | Neural networks, degree 4 |
| Spoke score | 4 / 14 = 0.29 |
| Chain score | 6 of 15 concepts have degree 2 = 0.40 |
| Orphans | none |
| Free or weak relations | none |
| Label | tree (not network: no cycles, no cross-links) |

Degrees for the show-your-work check: Neural networks 4; Intentional stance 3; NFAI 3;
Intentionality, Intentional interpretation, GOFAI, Formal system, Rules, Embodied and embedded AI 2;
Mind, Dennett, Connectionism, ChatGPT, Tokens, Roomba 1.

Adding one cross-link, for example `Intentional Stance -> is applicable to -> GOFAI`, should create a
cycle and flip the label to **network**. That is the live demo beat.

## Implications on the expert map

One implied proposition, because `developed from` is transitive:
**NFAI developed from Formal system** (from NFAI developed from GOFAI; GOFAI developed from Formal system).
No conflicts, no ill-typed propositions.

## Loading `student-demo.map.txt` (Stage 3)

| Check | Expected |
|---|---|
| Concepts / propositions | 12 / 12 |
| Components / cycles | 1 / 1 (the enables + prevents pair on the same two concepts) |
| Hub | GOFAI, degree 5. Spoke 0.42, chain 0.50. |
| Label | network by the cycle rule (a double edge is a degenerate cycle; acceptable for the demo, note it in show-your-work) |

**Implied (3):**

1. Embodied and embedded AI **is a kind of** Mind. From: Embodied AI is a kind of NFAI; NFAI is a kind of Mind. `is a kind of` is transitive.
2. Roomba **is an instance of** NFAI. From: Roomba is an instance of Embodied AI; Embodied AI is a kind of NFAI. `is an instance of` inherits along `is a kind of`.
3. Roomba **is an instance of** Mind. From: Roomba is an instance of NFAI (implied); NFAI is a kind of Mind.

Item 3 is the demo line. Choose **Except** and type: "is a kind of here means research program, not
thing that has a mind."

**Conflict (1):** GOFAI enables Understanding vs. GOFAI prevents Understanding (`enables` and
`prevents` are mutually incompatible).

**Ill-typed (1):** Turing test was invented by GOFAI. `was invented by` requires a `figure` as
object; GOFAI is a `research-paradigm`.

## Compare: student vs. expert (Stage 4)

| Measure | Expected |
|---|---|
| Shared propositions | 4 |
| Only in student (novel) | 8 |
| Only in expert (gaps) | 10 |
| Disputes (same pair, different relation) | 3 |
| Recall (share of expert propositions the student has) | 4 / 14 = 0.29 |
| Precision (share of student propositions in the expert map) | 4 / 12 = 0.33 |
| F1 | 0.31 |
| Goldsmith closeness | 0.41 |
| Concepts shared / student / expert | 10 / 12 / 15 |

Shared: Mind is constituted by Intentionality; Intentionality is explained by Intentional stance;
Intentional stance was invented by Dennett; Formal system is constituted by Rules.

Disputes (the richest discussion material; make sure these display):

1. GOFAI **is constituted by** Formal system (student) vs. GOFAI **developed from** Formal system (expert).
2. Embodied AI **is a kind of** NFAI (student) vs. NFAI **sees anti-representational leaning in** Embodied AI (expert).
3. Roomba **is an instance of** Embodied AI (student) vs. Roomba **is an example of** Embodied AI (expert).

## Round trip (any stage)

Load a `.map.txt`, print it back from the parsed map, re-parse the printed text. Proposition
count and every (subject, relation, object) triple must be identical. Sentence text may differ
(inverse labels print forward), and that is acceptable.
