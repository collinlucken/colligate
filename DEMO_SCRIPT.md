# Five-minute showcase script

Team showcases run 3 to 5 minutes. Rehearse once against the running app before showcases begin.
Cut from the bottom. Beats 1 to 3 are the point; if only those work, the demo succeeded.

**Opening line (10 s).** "Every concept-map tool on the market stores a picture. Ours stores
sentences, and because it has the sentences it can reason about them. There is no AI inside it.
Every claim it makes comes with a show-your-work button."

**Beat 1: sentences become a map (60 s).**
Blank map, focus question "What is mind design?". In the sentence view type four lines:

```
Mind -> is constituted by -> Intentionality
Intentionality -> is explained by -> Intentional Stance
Intentional Stance -> was invented by -> Dennett
GOFAI -> is constituted by -> Formal System
```
Watch the nodes appear, colored by type: Dennett grey (figure), GOFAI red (paradigm). Then drag a
link on the canvas from Formal System to Rules and pick "is constituted by". Point at the new
sentence appearing in the text. "Same object, two views."

**Beat 2: the tool sees the shape (45 s).**
Open the Structure panel. "Two components. Your Dennett branch and your formal-systems branch never
touch." Add `Intentional Stance -> is applicable to -> GOFAI`. Watch it become one component.
Press show-your-work: it prints the component count and the degrees. "It never tells you which
link to draw. That is the student's job."

**Beat 3: the tool sees a consequence (75 s).**
Load `student-demo.map.txt`. Implications panel shows three ghosted propositions. Read the last one
aloud: "Your map implies Roomba is an instance of Mind." Press show-your-work: the two rules,
transitivity and inheritance, and the three propositions that fired them. "This is exactly the
question Haugeland's chapter wants a student to face: is a research program about minds itself a
kind of mind?" Choose **Except**, type "is a kind of here means research program, not a thing with
a mind." Point at the conflict below it: "GOFAI enables understanding, GOFAI prevents
understanding. The student has to pick."

**Beat 4: compare with the instructor (45 s, cut first).**
Compare panel, load `sept2-expert.map.txt`. Four shared, eight novel, ten gaps, three disputes. Read
one dispute: "The student says GOFAI is constituted by formal systems. I said it developed from them.
That disagreement is Thursday's discussion question, generated with no grading and no AI."

**Beat 5: hold up the whiteboard (15 s, cut second).**
Show the September 2 hand-drawn map PDF next to the rendered one.

**Closing line (15 s).** "The design principle is maker's knowledge: you understand what you can
build. Constructing a map teaches substantially more than studying one, so the tool never draws a link
for you and hides the expert map until you've made your own. Built in an hour with Agent. Contains
no AI. Every judgment it makes is inspectable."

## If asked "why no AI in the product?"

Four reasons, pick one: the course bans student AI use, so the tool must be clean; a rule engine is
either right or has a findable bug, a model is confidently wrong in fluent sentences; there is no
per-student cost; and a teacher can defend a grade with a printed derivation.
