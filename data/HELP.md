# Help

## For students

### What this is

COLLIGATE is a manual concept-map workspace. You enter the vocabulary, place concepts on the
canvas, and decide what every arrow means. The proposition pane is a read-only record of
the arrows you have made. There is no course pack, imported text path, AI, inference
accept button, or reference-map comparison.

Every arrow, with a box at each end, reads as one sentence. Build the map to answer the
focus question at the top of the page. Structure statistics describe the map you made;
they do not add anything to it.

### Build a map from scratch

1. Enter a concept label in **Add concept**, then press **Add
   concept**. The label appears in **Your concept bank**.
2. Enter a relation label in **Add relation** and press **Add relation**. It appears in
   **Your relation bank**.
3. Click a concept-bank chip to place it on the canvas, or drag the chip to the place
   where you want the node. You can move nodes by dragging them.
4. Click one node and then another. Choose one of your relation labels in the picker.
   That creates one directed arrow and one proposition. If the relation bank is empty,
   add a relation before selecting the nodes.

You can repeat these steps in any order. You can also use **Auto-layout** after placing
nodes; it changes positions only, never concepts or arrows. The focus question remains
editable at the top. The proposition pane cannot be typed into: make changes on the
canvas.

### Your data

Your map, concept bank, and relation bank are kept in this browser. **Save map** makes a
JSON backup, and **Export SVG** makes a picture. Keep the JSON file somewhere safe; it
is the durable copy if you clear browser storage or change computers. Existing maps from
an earlier Weft session are preserved when this workspace first opens, but old course
banks are never restored. New banks start empty so every new label is yours.

Nothing is sent anywhere. COLLIGATE has no backend and no AI.

### Why you build it yourself

Students learn more from constructing a concept map than from studying a finished one:
the work of deciding what connects to what is where the learning happens. A finished map
records someone else's understanding. Vico's *verum factum*, the true is the made, and
Boden's phrase "if you can build it, you can understand it" express the same principle.
Your map should therefore be assembled manually, one decision at a time.

### What the right-hand panel tells you

**Structure** counts concepts, propositions, connected components, and density. Its
"show your work" text is a transparent account of those counts. The panel also identifies
unconnected concepts. It never suggests a connection.

### Show your work

The structure statistic has a **show your work** toggle. Press it to see the exact
counts and deterministic calculation behind the description. The application does not
judge whether a proposition is true; that judgment belongs to you.

### Assignment codes

If your instructor writes a code on the board, enter it in **Assignment code**. That
loads the guiding question and the requirements for the map. If the assignment has a
time limit, the timer starts when you press **Enter**. Export and print then
tell you whether the map meets those requirements. A map that does not yet meet them
can still be downloaded; it is stamped NEEDS WORK.

---

## For instructors

### The manual-authoring principle

This version protects construction by requiring students to create both sides of their
vocabulary:

- The concept bank starts empty.
- The relation bank starts empty.
- A relation can be chosen only after the student has created its label.
- A proposition is created only by selecting two placed nodes and choosing that relation.
- The proposition pane is read-only, so text import cannot bypass canvas assembly.

There is no course-pack loader, text importer, map loader, inference acceptance path, or
course-pack comparison UI. Students can save a JSON map and export an SVG, but the
working map is assembled in the canvas.

### Running an assignment

1. Create the assignment with **Create assignment**, or add it to the published catalog
   (`src/assignments.catalog.json`) with a short chalkboard code such as `MIND1`.
2. Write the code on the board. Students enter it; COLLIGATE sets the focus question,
   starts the timer, and shows the live checklist (unique concepts, unique relations,
   connection count, time limit, required labels, and whether the map is connected).
   Re-entering the same code in the same browser resumes the original start time.
3. Students build the map themselves and export SVG or print PDF. A map that meets the
   requirements is stamped MEETS REQUIREMENTS. One that does not is stamped NEEDS WORK
   and lists the failed rules. Content and truth-value are still yours to grade.
4. **Use this assignment** saves the code in this browser only. To give a class a short
   code, publish it in the catalog. A share ticket (`CG:...`) encodes the same assignment
   for a slide or LMS if you do not want to republish.

DEMO and MIND1 ship as practice codes.

### Local data and older maps

There are no accounts, server calls, or shared course files. A map, its manual banks,
and session metadata stay in the student's browser unless the student saves a JSON
backup. If an older `weft-map` is found, COLLIGATE restores that map without deleting it and
shows a notice. It does not read the old `weft-pack` storage and does not display any
course concepts or relation labels as a bank.

The maker's knowledge principle is intentional: a student should be able to explain why
each node and arrow is present because they entered and assembled it.