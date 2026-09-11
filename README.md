# Replit hackathon prep: concept-map learning system

Everything needed for the 45 to 60 minute build block, in the order to use it.

## The list, in order

1. **Data files** (done; in `pack/` and `maps/`)
   - `pack/phil2400-f26.pack.json` The PHIL 2400 domain pack. 152 concepts from the Key Terms
     file (62 core concepts, 14 paradigms, 9 systems and examples, 65 figures, 2 texts), 33
     relation types with logical properties, the whiteboard alias table, 31 sources, 27 units,
     the three graded-map presets, and rubric templates.
   - `maps/sept2-expert.map.txt` and `.json` The September 2 whiteboard map, transcribed.
   - `maps/student-demo.map.txt` and `.json` A student map built to fire every engine feature.
   - `maps/expected-outputs.json` and `EXPECTED_OUTPUTS.md` What the app must say about them.
   - `data/HELP.md` The in-app Help page: one section for students, one for instructors. Also
     usable as-is as the how-to page on your website.
   - `data/` is the upload-ready copy of everything the app needs.
2. **Agent prompt** (done): `AGENT_SPEC.md`. Paste whole into Replit Agent in Plan mode.
3. **Name** (your decision). Working name in the files is **Weft**: the cross-threads in weaving,
   which is what cross-links are in a map. Short, unclaimed as a file extension (`.weft`), works as
   a verb ("weft your reading"). Alternatives if you dislike it: **Sinew** (the tissue that
   connects), **Ligature**. Whatever you pick, find-and-replace "Weft" in `AGENT_SPEC.md` and
   `DEMO_SCRIPT.md` before the session.
4. **Workspace login** (you, before the session). Log in to the Bowdoin Replit workspace, confirm
   you can create a Repl there, and confirm the sponsored credits show. Have the five data files
   on the laptop you will use, not only in OneDrive.

## During the session

| Minute | Do |
|---|---|
| 0 to 20 | Replit's walkthrough. Meanwhile: create the Repl, upload the `data/` folder (six data files plus HELP.md). |
| 20 to 25 | Paste `AGENT_SPEC.md` in Plan mode. Read the plan. If it proposes a server, a database, or accounts, say no. Say "Build Stage 1." |
| 25 to 40 | Stage 1 then Stage 2. Check against `EXPECTED_OUTPUTS.md` after each. |
| 40 to 55 | Stage 3. If it lands with time left, Stage 4. |
| 55 to 60 | Publish to a private URL. Export the ZIP. Run the demo script once. |

If Agent stalls on a stage for more than one iteration, give it the relevant expected numbers from
`EXPECTED_OUTPUTS.md` as the failing test and ask it to make that test pass.

## Rebuilding the data

`tools/build_pack.py` regenerates the pack and both maps from `Key_Terms_Readings_1-2.md` in the
course folder. `tools/reference_engine.py` recomputes the expected outputs. Run both after any
edit to the Key Terms file or the sentence maps:

```bash
python3 tools/build_pack.py && python3 tools/reference_engine.py > maps/expected-outputs.json
```

## Known rough edges in the pack (fine for the demo, fix later)

- Concept IDs are readable slugs (`c-intentional-stance`), not ULIDs. Stable either way.
- Nine figures carry Wikidata IDs; spot-check them before relying on them. The rest are empty.
- A few Key Terms entries are section-like rather than concepts ("Member disciplines", "Two
  footpaths", "What a 5-year-old robot would require"). Prune in the Key Terms file and rebuild.
- `hierarchy_weight` values are first guesses. The structure classifier's thresholds are in
  `pack.inference.structure_thresholds` and will need tuning against real student maps.
- Units 3 onward have no concepts attached yet; they fill in as each week's Key Terms file exists.

## What this deliberately leaves out of the hackathon build

Yjs, the event log as source of truth, nested submaps, accounts, sync, PDF export, flashcards,
Playwright. The brief calls several of these day-one foundations. For a 60-minute Agent build they
are the difference between a working demo and none. Treat the session output as a spec validator
and carry the data files forward into the real build.
