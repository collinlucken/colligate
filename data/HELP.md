# Help

## For students

### What this is

A concept map is a set of sentences drawn as a picture. Each arrow, with the box at each end,
reads as one sentence: "The intentional stance was invented by Dennett." You build the map to
answer one question, called the focus question, which sits at the top.

This tool stores your sentences, not just the picture. That lets it tell you things about your map
that a drawing program cannot: what shape it has, what it implies that you did not say, and how it
compares with another map. It contains no artificial intelligence. Everything it tells you comes
from a rule you can read by pressing "show your work."

### Why you build it yourself

The tool will not draw a link for you, will not suggest a relation, and keeps your instructor's map
hidden until you have made your own. That is deliberate, and there are two reasons.

The first is evidence. Across more than a hundred studies, students who construct concept maps learn
substantially more than students who study finished ones: an average effect of about 0.72 standard
deviations for building against about 0.43 for studying (Schroeder, Nesbit, Anguiano and Adesope,
2018). The work of deciding what connects to what is where the learning is. A finished map, however
good, is a record of someone else's understanding.

The second reason is older and belongs to this course. In the early eighteenth century Giambattista
Vico argued that we truly understand only what we can make. Margaret Boden, whom you read in week
one, compresses it to "if you can build it, you can understand it," and makes it the justification
for the whole project of building models of the mind. The same principle applies to you and your
map. If you can build a map of Haugeland's chapter, with every arrow labeled and every cross-link
justified, you understand the chapter. If you paste in someone else's map, you have a picture.

This is why a map made by an AI, or copied from a classmate, is not a shortcut to the assignment. It
skips the only part that does anything. The map also records how it was built, so the difference
is visible.

### Your map lives on your computer

Nothing you make here is sent anywhere. The map is kept in your browser and in the files you save.
That means two things.

1. **Save your map file at the end of every session.** Press **Save map**. You get a file ending in
   `.map.json`. Keep it somewhere you will find it. If you clear your browser or switch laptops,
   that file is the only copy.
2. **To hand in a map, send the file.** Upload the `.map.json` file wherever your instructor asks.
   You can also **Export SVG** for a picture, but the file is what counts.

To pick up where you left off on another computer, press **Load map** and choose your file.

### Two ways to build

**Type it.** In the left panel, write one sentence per line in this form:

```
Intentional Stance -> was invented by -> Dennett
```

The picture draws itself as you type. Add a confidence from 1 to 5 with `@`, a page reference in
square brackets, and a reason after two slashes, like this:

```
Formal System -> is constituted by -> Rules  @4  [haugeland-2023 17]  // Haugeland's definition
```

**Draw it.** Drag a concept from the concept bank onto the canvas. Click one box, then another, and
choose how they are related from the list. The sentence appears in the left panel. Either way of
working edits the same map.

### The concept bank and the relation list

Your course comes with a bank of concepts and a list of ways to connect them. Use them when they
fit; the tool can only compare maps exactly when everyone uses the same names. You are never
stuck, though. Type a concept that is not in the bank and it is added, marked as new. Type a
relation that is not on the list and it is kept, marked as free text. New concepts are often your
best ideas. Bring them to class.

Avoid "is related to" if you can. It is allowed, but it says almost nothing, and the tool will
nudge you toward something more specific.

### What the right-hand panels tell you

**Structure.** The shape of your map. A *spoke* connects everything to one hub. A *chain* is a
line of one thing after another. A *network* has cross-links between its branches, and that is
what expert maps look like. The panel names branches that never touch. It will not tell you what
arrow to draw between them. That is your job.

**Implications.** Some relations have logic. "Is a kind of" chains: if a Roomba is an instance of
embodied AI, and embodied AI is a kind of NFAI, then your map is saying a Roomba is an instance of
NFAI, whether you wrote that or not. The tool shows these as dashed arrows with a question mark and
asks what you want to do:

- **Accept**: yes, I meant that. It becomes a normal sentence in your map.
- **Fix**: no, one of the sentences that led there is wrong. The tool highlights them so you can
  change one.
- **Except**: the sentences are right but the conclusion does not follow here, and you say why in
  one line. Deciding which of these applies is where a lot of the thinking happens.

The same panel shows conflicts (two sentences that cannot both be true, like "X enables Y" and "X
prevents Y") and sentences that do not make sense as written (a research program cannot have
"invented" something; a person can).

**Compare.** Load a second map, such as your instructor's, and see what you share, what you have
that they do not, what they have that you do not, and where you connected the same two ideas with
different arrows. Nothing here is marked wrong. A sentence your instructor's map lacks may be your
best one.

### Show your work

Every number and message has a "show your work" toggle. Press it. You will see the exact count or
rule that produced what you are reading. If you think the tool is wrong, that is where to look.

---

## For instructors

### The maker's knowledge principle

Every design decision in this tool follows from one idea: understanding is what you can build.
The evidence for concept maps is specific. Constructing a map produces an effect on learning of
roughly g = 0.72, studying a finished one roughly g = 0.43, and the overall average across
meta-analyses sits near g = 0.58 (Nesbit and Adesope, 2006; Schroeder et al., 2018). The tool is
built to protect the construction:

- It never proposes a link. The Structure panel names branches that do not touch; the student
  supplies the relation.
- The Implications panel shows what a map entails and asks the student to decide. The deciding is
  the work.
- Your expert map is revealed only after submission, so students build before they see.
- Cross-links carry a written justification, because explaining a connection is itself a
  learning act.
- The tool contains no AI, and every judgment it makes is inspectable. A student can see how the
  tool itself was made, all the way down.

The principle has a history worth telling students. Vico's verum factum, "the true is the made,"
was an argument that only the humanities give real knowledge, since they study what humans made.
Boden turns it around in Mind as Machine: if you can build it, you can understand it, and so
building models is how a science of mind proceeds. A student building a map is doing, at their own
scale, what the field they are studying does.

For the same reason, a map produced by an AI is not a threat the tool needs to defeat. It is a
missed assignment. The saved file records when each proposition was added, how long the map was
worked on, and how many edits it took, so a map pasted in at once looks like what it is.

### What you need to run this

A web address where the tool lives, and a way for students to send you files. Nothing else. There
are no accounts, no server, and no student data anywhere but on students' own machines and in the
files they choose to send. The tool contains no AI and makes no network calls, so it is usable
under any course policy that restricts AI.

### The pack

The tool is driven by a **pack**: a file holding your course's concepts, the relation types
students can use, the readings, and the week-by-week units. Press **Load pack** to use your own.
The pack that ships with the tool is for PHIL 2400, Minds and Machines, at Bowdoin College. Start
from it if it helps: most of its relation types (is a kind of, causes, supports, developed from)
fit any discipline, and its concept bank is what you would replace.

A pack is a plain JSON file. Each concept has a stable id, a label, aliases, a type, and a
definition. Each relation type has a label, an optional reverse reading, a family, and the logical
properties the tool reasons with: whether it chains (transitive), what it is incompatible with, and
what kinds of concept it may connect. Change those properties and the Implications panel changes
its behavior accordingly.

### Running an assignment

1. Set a focus question and tell students the rules: how many concepts, how many relations per
   concept, whether cross-links need a written justification.
2. Students build the map, press **Save map**, and upload the `.map.json` file to your course site.
3. Open each file with **Load map**. The Structure panel gives you the counts. Load your own map
   in the Compare panel to see coverage, gaps, novel propositions, and disputes.
4. Grade the content yourself. The tool counts and compares; it never judges whether a sentence is
   true. Its numbers are evidence for your rubric, not a score.

Keep your own map hidden until students have submitted. If they see it first, the class
collapses onto your map and you lose the information their differences carry.

### The disputes list is your discussion plan

When two maps connect the same pair of concepts with different relations, the Compare panel lists
the pair. Across a class, the pairs students disagree about most are the day's best discussion
questions, and the tool produces them with no grading and no AI.

### Writing your own map

Type it in the sentence view, one line per proposition, and save it. The sentence form is also a
good way to share a map by email or paste it into a document.

### Sharing

Packs and maps are files. Send them, post them, fork them. Another instructor can load your pack,
delete what does not fit, and add their own concepts.
