#!/usr/bin/env python3
"""
Build the PHIL 2400 domain pack and the two demo maps from course materials.

Inputs (course folder):
  Key_Terms_Readings_1-2.md      -> concept bank (Part I terms, Part II people)
  (relation table, alias table, units, presets are encoded below, from the
   Vision and Architecture Brief sections 5.2, 15.3, 15.4, 15.6, 15.7)

Outputs (Replit_Hackathon_Prep/):
  pack/phil2400-f26.pack.json
  maps/sept2-expert.map.txt / .json
  maps/student-demo.map.txt / .json

Re-run any time the Key Terms file changes:  python3 tools/build_pack.py
"""
import json, re, sys, unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
PREP = HERE.parent
COURSE = PREP.parent
KEY_TERMS = COURSE / "Key_Terms_Readings_1-2.md"

PACK_ID = "phil2400-f26"
NOW = "2026-09-11T08:00:00Z"

# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s

def norm(s):
    s = s.translate(str.maketrans({"\u2019": "'", "\u2018": "'", "\u201c": '"', "\u201d": '"', "\u2014": "-", "\u2013": "-"}))
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"\s+", " ", s).strip().lower()
    s = s.strip('"“”\'')
    return s

def md_plain(s):
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"\*(.+?)\*", r"\1", s)
    return s.strip()

# --------------------------------------------------------------------------
# 1. Concept bank from Key Terms
# --------------------------------------------------------------------------
PARADIGMS = {
    "gofai", "nfai", "connectionism", "embodied and embedded ai", "cybernetics",
    "a-life", "cognitive science", "dynamical systems", "knowledge engineering",
    "evolutionary psychology", "artificial intelligence", "technological vs. psychological (or biological) ai",
    "computational neuroscience", "behaviourism",
}
EXAMPLES = {"deep blue", "chess", "baseball", "the penny on the checkerboard",
            "neural networks", "chatgpt", "roomba", "zombie", "chinese room"}

# meta entries in the Key Terms file that are not concepts
SKIP = {"the definitional problem", "the label problem", "what's out",
        "never mind minds?", "the health warning on the definition", "the changing labels"}

# label rewrites: raw bold text -> (canonical label, extra aliases)
RELABEL = {
    'gofai - "good old-fashioned ai"': ("GOFAI", ["good old-fashioned AI", "classical AI", "symbolic AI", "symbol-manipulation AI", "language-of-thought AI"]),
    "nfai": ("NFAI", ["new-fangled AI"]),
    "control theory, alias cybernetics": ("Cybernetics", ["control theory"]),
    "artificial intelligence (ai)": ("Artificial intelligence", ["AI"]),
    "universal machine / universality": ("Universal machine", ["universality", "universal Turing machine"]),
    "embodied and embedded ai": ("Embodied and embedded AI", ["Embodied AI", "embedded AI", "situated AI", "embodied cognition"]),
    "materialism, minimal sense": ("Materialism (minimal sense)", ["materialism"]),
    "turing test": ("Turing test", ["imitation game", "the Turing test"]),
    "connectionism": ("Connectionism", ["connectionist AI", "PDP", "parallel distributed processing", "neural-network AI"]),
    "the chinese room": ("Chinese Room", ["Chinese Room argument", "Searle's Chinese Room"]),
    "formal system": ("Formal system", ["formal systems"]),
    "boden's definition": ("Cognitive science", ["cognitive sciences", "Boden's definition of cognitive science"]),
    "verum factum / \"maker's knowledge\"": ("Verum factum", ["maker's knowledge", "if you can build it, you can understand it"]),
    "\"rationality is the mother of intention\"": ("Rationality is the mother of intention", ["Dennett's slogan"]),
    "\"catholic\" in three ways": ("Cognitive science is catholic", []),
    "\"cyborg science\" / \"reinvention of nature\"": ("Cyborg science", ["reinvention of nature", "Haraway's critique"]),
}
# compound entries to split into two concepts sharing the definition
SPLIT = {
    "intentional stance / intentional system": ["Intentional stance", "Intentional system"],
}

def parse_key_terms(text):
    concepts = []          # dicts
    by_norm = {}           # norm label -> concept
    reading = None
    part = 1
    section_tag = None

    def add(label, aliases, ctype, definition, page, reading, tags):
        key = norm(label)
        if key in by_norm:
            c = by_norm[key]
            if page and reading:
                c["sources"].append(anchor(reading, page))
            for a in aliases:
                if a not in c["aliases"] and norm(a) != key:
                    c["aliases"].append(a)
            if not c["definition"] and definition:
                c["definition"] = definition
            return c
        c = {
            "id": "c-" + slug(label),
            "label": label,
            "aliases": [a for a in aliases if norm(a) != key],
            "type": ctype,
            "definition": definition,
            "sources": [anchor(reading, page)] if (page and reading) else [],
            "external_ids": {},
            "tags": list(tags),
            "pack_id": PACK_ID,
            "created_at": NOW,
            "created_by": "instructor",
        }
        concepts.append(c)
        by_norm[key] = c
        for a in c["aliases"]:
            by_norm.setdefault(norm(a), c)
        return c

    # join wrapped lines into paragraphs
    paras, buf = [], []
    for line in text.splitlines():
        if line.strip() == "":
            if buf:
                paras.append(" ".join(buf)); buf = []
        else:
            buf.append(line.strip())
    if buf: paras.append(" ".join(buf))

    for p in paras:
        if p.startswith("# Part II"):
            part = 2; continue
        if p.startswith("## Reading 1"):
            reading = "haugeland-2023"; section_tag = "reading-1"; continue
        if p.startswith("## Reading 2"):
            reading = "boden-2006-ch1"; section_tag = "reading-2"; continue
        if p.startswith("## Terms that appear in both") or p.startswith("### Not a person") or p.startswith("## Cross-references"):
            reading = None; continue
        if p.startswith("### ") and part == 2 and reading is None:
            reading = "boden-2006-ch1"
        if p.startswith("#") or p.startswith("|") or p.startswith("---"):
            continue
        m = re.match(r"^\*\*(.+?)\*\*\s*(?:\(([^)]*)\))?\s*—\s*(.*)$", p)
        if not m or reading is None:
            continue
        raw, page, definition = m.group(1), m.group(2), md_plain(m.group(3))
        raw_plain = md_plain(raw)
        tags = [section_tag]
        if part == 1:
            key = norm(raw_plain)
            if key in SKIP: continue
            if key in SPLIT:
                for lab in SPLIT[key]:
                    add(lab, [], "core-concept", definition, page, reading, tags)
                continue
            if key in RELABEL:
                label, aliases = RELABEL[key]
            else:
                label, aliases = raw_plain, []
            k2 = norm(label)
            ctype = "research-paradigm" if k2 in PARADIGMS else "system-or-example" if k2 in EXAMPLES else "core-concept"
            add(label, aliases, ctype, definition, page, reading, tags)
        else:
            # people. Split multi-person entries.
            names = split_people(raw_plain)
            for name, dates in names:
                label, aliases = canonical_person(name)
                c = add(label, aliases, "figure", definition if len(names) == 1 else "", None, reading, tags)
                if dates and "dates" not in c:
                    c["dates"] = dates
                if reading and not any(s["source_id"] == reading for s in c["sources"]):
                    c["sources"].append(anchor(reading, None))
    return concepts, by_norm

RELABEL = {norm(k): v for k, v in RELABEL.items()}
SPLIT = {norm(k): v for k, v in SPLIT.items()}
SKIP = {norm(k) for k in SKIP}
PARADIGMS = {norm(k) for k in PARADIGMS}
EXAMPLES = {norm(k) for k in EXAMPLES}

def anchor(source_id, page):
    a = {"source_id": source_id}
    if page: a["locator"] = "p. " + page.replace("–", "-")
    return a

def split_people(raw):
    # "Allen Newell (1927–1992) and Herbert Simon (1916–2001)" -> two
    parts = re.split(r",\s+|;\s+|\s+and\s+", raw)
    out = []
    for part in parts:
        part = part.strip().replace(" et al.", "")
        m = re.match(r"^(.*?)\s*\(([^)]*)\)\s*$", part)
        if m:
            dates = m.group(2).strip()
            out.append((m.group(1).strip(), dates if ("–" in dates or "-" in dates) else None))
        elif part:
            out.append((part, None))
    return out

PERSON_CANON = {
    "a. m. turing": "Alan Turing", "alan turing": "Alan Turing",
    "daniel c. dennett": "Daniel Dennett", "margaret a. boden": "Margaret Boden",
    "w. v. o. quine": "W. V. O. Quine", "john haugeland": "John Haugeland",
    "w. ross ashby": "W. Ross Ashby", "w. grey walter": "W. Grey Walter",
}
def canonical_person(name):
    label = PERSON_CANON.get(norm(name), name)
    aliases = []
    if norm(name) != norm(label): aliases.append(name)
    last = label.split()[-1]
    if last.lower() not in ("turing",) or True:
        aliases.append(last)
    if label == "Alan Turing": aliases += ["A. M. Turing", "Turing"]
    if label == "Daniel Dennett": aliases += ["Dennett", "Daniel C. Dennett"]
    return label, list(dict.fromkeys(aliases))

# --------------------------------------------------------------------------
# 2. Extra concepts needed by the maps but not bold terms in Key Terms
# --------------------------------------------------------------------------
EXTRA = [
    ("Mind", ["the mind", "minds"], "core-concept", "The thing mind design tries to understand in terms of its design. Root concept of the course map.", ["reading-1"]),
    ("Mind design", [], "core-concept", None, ["reading-1"]),   # merges into existing
    ("Rules", ["formal rules", "rule"], "core-concept", "The formal rules of a token manipulation system: they specify only the next arrangement and only in terms of the current one.", ["reading-1"]),
    ("Tokens", ["formal token", "formal tokens", "token"], "core-concept", "The items a formal system manipulates. Chess pieces and go stones are mere formal tokens; numerals are symbols.", ["reading-1"]),
    ("Neural networks", ["NN", "neural nets", "ANN", "artificial neural networks", "neural network"], "system-or-example", "Networks of many simple, richly interconnected units with activation levels and connection weights; the systems connectionism builds.", ["reading-1"]),
    ("ChatGPT", ["GPT", "large language model", "LLM"], "system-or-example", "A present-day large language model; the class's running example of a system implemented by neural networks.", []),
    ("Roomba", ["robot vacuum"], "system-or-example", "A robot vacuum cleaner; the class's example of embodied and embedded AI.", []),
    ("Chess", ["chess machine"], "system-or-example", "Haugeland's example of a formal system: token manipulation, digital, medium independent.", ["reading-1"]),
    ("Baseball", [], "system-or-example", "Haugeland's example of a game that is not a formal system.", ["reading-1"]),
    ("The penny on the checkerboard", ["penny on the checkerboard"], "system-or-example", "Haugeland's illustration of digital versus analog re-identification.", ["reading-1"]),
    ("Computational neuroscience", [], "research-paradigm", "The computational modelling of the brain; the course's fifth period tag.", []),
    ("A-Life", ["artificial life", "ALife"], "research-paradigm", None, ["reading-2"]),
    ("Symbol", ["symbols"], "core-concept", "A token that means something (numerals, arithmetic signs), as opposed to a mere formal token.", ["reading-1"]),
    ("Behaviourism", ["behaviorism"], "research-paradigm", "The approach cognitive science named itself against; significant chiefly as something reacted against.", ["reading-2"]),
]

# Wikidata QIDs: only high-confidence ones; spot-check before relying on them
QIDS = {
    "Alan Turing": "Q7251", "Daniel Dennett": "Q312632", "René Descartes": "Q9191",
    "Aristotle": "Q868", "Immanuel Kant": "Q9312", "Noam Chomsky": "Q9049",
    "John von Neumann": "Q17455", "Gottlob Frege": "Q60059", "Johann von Goethe": "Q5879",
}

PERIOD_TAGS = {
    "Cybernetics": "cybernetic", "GOFAI": "gofai", "Connectionism": "connectionist",
    "Embodied and embedded AI": "embodied", "Computational neuroscience": "computational-neuroscience",
    "Neural networks": "connectionist", "A-Life": "embodied", "Formal system": "gofai",
    "Universal machine": "gofai", "Symbol vs. formal token": "gofai",
}

# --------------------------------------------------------------------------
# 3. Relation vocabulary (brief section 5.2) + promotions (15.3)
# --------------------------------------------------------------------------
# (label, inverse_label, family, transitive, symmetric, incompatible_with labels, subj types, obj types, hierarchy_weight, description)
ANY = []
REL_ROWS = [
    ("is a kind of", "has as a kind", "taxonomic", True, False, [], ["core-concept", "research-paradigm"], ["core-concept", "research-paradigm"], -1,
     "Subject is a subtype of object. Chains: a robin is a kind of bird, a bird is a kind of animal, so a robin is a kind of animal."),
    ("is an instance of", "has as an instance", "taxonomic", False, False, [], ["system-or-example"], ["core-concept", "research-paradigm"], -1,
     "Subject is a particular thing falling under the object concept."),
    ("is part of", "has as a part", "compositional", True, False, [], ANY, ANY, -1,
     "Subject is a component of object."),
    ("is constituted by", "constitutes", "compositional", False, False, [], ["core-concept", "research-paradigm"], ANY, +1,
     "Object is what the subject is made of or requires: mind is constituted by intentionality."),
    ("is defined as", "defines", "explanatory", False, False, [], ["core-concept", "research-paradigm"], ANY, 0,
     "Object gives the definition of subject."),
    ("is explained by", "explains", "explanatory", False, False, [], ["core-concept", "research-paradigm"], ANY, +1,
     "Object is the account that explains subject: intentionality is explained by the intentional stance."),
    ("is implemented by", "implements", "explanatory", False, False, [], ANY, ANY, +1,
     "Object realizes or runs subject: neural networks are implemented by ChatGPT (as the class put it)."),
    ("presupposes", "is presupposed by", "explanatory", True, False, ["presupposes the falsity of"], ["core-concept", "research-paradigm"], ANY, 0,
     "Subject cannot be true or in place unless object is."),
    ("causes", "is caused by", "causal", False, False, [], ANY, ANY, 0, "Subject brings about object."),
    ("enables", "is enabled by", "causal", False, False, ["prevents"], ANY, ANY, 0, "Subject makes object possible."),
    ("prevents", "is prevented by", "causal", False, False, ["enables"], ANY, ANY, 0, "Subject rules object out."),
    ("developed from", "gave rise to", "historical", True, False, [], ["core-concept", "research-paradigm", "system-or-example"], ["core-concept", "research-paradigm", "system-or-example"], 0,
     "Subject grew historically out of object. Read backwards: object gave rise to subject."),
    ("replaced", "was replaced by", "historical", False, False, [], ["research-paradigm"], ["research-paradigm"], 0, "Subject took over from object as the reigning approach."),
    ("reinterpreted", "was reinterpreted by", "historical", False, False, [], ANY, ANY, 0, "Subject gave a new reading of object."),
    ("narrowed", "was narrowed by", "historical", False, False, ["broadened"], ["core-concept"], ["core-concept"], 0, "Subject made the meaning of object more restrictive."),
    ("broadened", "was broadened by", "historical", False, False, ["narrowed"], ["core-concept"], ["core-concept"], 0, "Subject made the meaning of object more inclusive."),
    ("supports", "is supported by", "dialectical", False, False, ["undermines", "refutes"], ANY, ANY, 0, "Subject is evidence or argument for object."),
    ("undermines", "is undermined by", "dialectical", False, False, ["supports"], ANY, ANY, 0, "Subject weakens object without refuting it."),
    ("refutes", "is refuted by", "dialectical", False, False, ["supports"], ANY, ANY, 0, "Subject shows object false."),
    ("objects to", "is objected to by", "dialectical", False, False, [], ANY, ANY, 0, "Subject raises an objection against object."),
    ("responds to", "is responded to by", "dialectical", False, False, [], ANY, ANY, 0, "Subject answers object."),
    ("presupposes the falsity of", None, "dialectical", False, False, ["presupposes"], ["core-concept"], ["core-concept"], 0, "Subject can only be true if object is false."),
    ("was proposed by", "proposed", "attributive", False, False, [], ANY, ["figure"], +1, "Object is the person who put subject forward."),
    ("was invented by", "invented", "attributive", False, False, [], ANY, ["figure"], +1, "Object is the person who created subject."),
    ("is attributed to", None, "attributive", False, False, [], ["core-concept", "research-paradigm"], ANY, +1, "Object is credited with subject."),
    ("is discussed in", "discusses", "attributive", False, False, [], ANY, ["text"], +1, "Object is a text in which subject is treated."),
    ("is an example of", "has as an example", "attributive", False, False, [], ["system-or-example"], ["core-concept", "research-paradigm"], -1, "Subject illustrates object."),
    ("is related to", None, "associative", False, True, [], ANY, ANY, 0, "Weak catch-all. Counts for nothing structurally; replace it with something more specific when you can."),
    # promoted from the instructor's September 2 labels (brief 15.3)
    ("sees greatest hope in", None, "attributive", False, False, [], ["research-paradigm"], ["system-or-example", "research-paradigm"], 0, "A research program's bet on which kind of system will succeed."),
    ("sees anti-representational leaning in", None, "attributive", False, False, [], ["research-paradigm"], ["research-paradigm"], 0, "A research program's reading of another as turning away from internal representation."),
    ("is applicable to", "admits", "explanatory", False, False, [], ANY, ANY, 0, "Subject (a stance, method, or test) can be brought to bear on object."),
    ("operates on", "is operated on by", "explanatory", False, False, [], ANY, ANY, +1, "Subject works on or manipulates object: rules operate on tokens."),
    ("centrally concerns", "is the central concern of", "explanatory", False, False, [], ANY, ANY, +1, "Object is the main topic of subject."),
]
GENRES_DIALECTICAL = ["argument", "concept"]

def build_relations():
    rels = []
    for label, inv, fam, trans, sym, incompat, st, ot, hw, desc in REL_ROWS:
        rid = slug(label)
        rels.append({
            "id": rid, "label": label, "inverse_label": inv, "family": fam,
            "genres": ["concept", "argument"] if fam == "dialectical" else ["concept", "mind"],
            "directed": not sym, "symmetric": sym, "transitive": trans,
            "inverse_of": None,
            "incompatible_with": [slug(x) for x in incompat],
            "subject_types": st, "object_types": ot, "hierarchy_weight": hw,
            "description": desc, "examples": [],
        })
    return rels

# free-text labels seen on the September 2 whiteboard -> relation id (brief 15.3)
RELATION_ALIASES = {
    "required / primary": "is-constituted-by", "required": "is-constituted-by", "primary": "is-constituted-by",
    "explained by": "is-explained-by", "allows for": "enables", "applies to": "is-applicable-to",
    "powers": "implements",                     # reversed: X powers Y == X implements Y
    "constituted by": "is-constituted-by", "for manipulating": "operates-on", "is for manipulating": "operates-on",
    "built up by": "gave-rise-to",              # reversed: X built up by Y == Y developed from X
    "was built off": "developed-from", "mostly focused on": "centrally-concerns",
    "invented by": "was-invented-by", "paradigm shifted": "gave-rise-to",
    "is the present-day example of": "is-an-example-of",
    "is a type of": "is-a-kind-of", "is a": "is-a-kind-of", "example of": "is-an-example-of",
    "led to": "gave-rise-to", "caused the rise of": "gave-rise-to",
}

# --------------------------------------------------------------------------
# 4. Sources and units (reading schedule)
# --------------------------------------------------------------------------
SOURCES = [
    {"id": "haugeland-2023", "kind": "chapter", "title": "What Is Mind Design?", "authors": ["John Haugeland"], "container": "Mind Design III, ch. 2", "year": 2023, "pages": "11-34"},
    {"id": "boden-2006-ch1", "kind": "chapter", "title": "Setting the Scene; The Scope of Cognitive Science", "authors": ["Margaret Boden"], "container": "Mind as Machine, ch. 1.i-1.ii", "year": 2006, "pages": "1-18"},
    {"id": "boden-2006-ch2", "kind": "chapter", "title": "Descartes; Vaucanson; the neurophysiological machine", "authors": ["Margaret Boden"], "container": "Mind as Machine, ch. 2.ii, 2.iv, 2.viii", "year": 2006},
    {"id": "boden-2006-ch3", "kind": "chapter", "title": "Babbage's analytical engines", "authors": ["Margaret Boden"], "container": "Mind as Machine, ch. 3.iii, 3.iv, 3.vi", "year": 2006},
    {"id": "turing-1950", "kind": "chapter", "title": "Computing Machinery and Intelligence", "authors": ["Alan Turing"], "container": "Mind Design III, ch. 6", "year": 1950},
    {"id": "boden-2006-ch4a", "kind": "chapter", "title": "Turing; McCulloch-Pitts; the logical neurone", "authors": ["Margaret Boden"], "container": "Mind as Machine, ch. 4.i-4.iv", "year": 2006},
    {"id": "boden-2006-ch4b", "kind": "chapter", "title": "Cybernetics; Craik; Walter; Ashby", "authors": ["Margaret Boden"], "container": "Mind as Machine, ch. 4.v-4.ix", "year": 2006},
    {"id": "maley-2023", "kind": "chapter", "title": "The Analog Alternative", "authors": ["Corey Maley"], "container": "Mind Design III, ch. 5", "year": 2023},
    {"id": "boden-2006-ch6", "kind": "chapter", "title": "The cognitive revolution", "authors": ["Margaret Boden"], "container": "Mind as Machine, ch. 6.i-6.iii", "year": 2006},
    {"id": "newell-simon-1976", "kind": "chapter", "title": "Computer Science as Empirical Inquiry", "authors": ["Allen Newell", "Herbert Simon"], "container": "Mind Design III, ch. 3", "year": 1976},
    {"id": "boden-2006-ch10", "kind": "chapter", "title": "When GOFAI was NewFAI (selections)", "authors": ["Margaret Boden"], "container": "Mind as Machine, ch. 10", "year": 2006},
    {"id": "boden-2006-ch11", "kind": "chapter", "title": "Of Bombs and Bombshells (selections)", "authors": ["Margaret Boden"], "container": "Mind as Machine, ch. 11", "year": 2006},
    {"id": "marr-1982", "kind": "chapter", "title": "Vision", "authors": ["David Marr"], "container": "Mind Design III, ch. 4", "year": 1982},
    {"id": "boden-2006-ch7a", "kind": "chapter", "title": "Three levels, two types; visions of vision", "authors": ["Margaret Boden"], "container": "Mind as Machine, ch. 7.iii, 7.v", "year": 2006},
    {"id": "searle-1980", "kind": "chapter", "title": "Minds, Brains, and Programs", "authors": ["John Searle"], "container": "Mind Design III, ch. 12", "year": 1980},
    {"id": "boden-2006-ch16c", "kind": "chapter", "title": "That room in China", "authors": ["Margaret Boden"], "container": "Mind as Machine, ch. 16.v.c", "year": 2006},
    {"id": "boden-1988", "kind": "chapter", "title": "Escaping from the Chinese Room", "authors": ["Margaret Boden"], "container": "Mind Design III, ch. 13", "year": 1988},
    {"id": "boden-2006-ch16b", "kind": "chapter", "title": "Three variations on a theme", "authors": ["Margaret Boden"], "container": "Mind as Machine, ch. 16.iv", "year": 2006},
    {"id": "dennett-1981", "kind": "chapter", "title": "True Believers", "authors": ["Daniel Dennett"], "container": "Mind Design III, ch. 11", "year": 1981},
    {"id": "russell-2023", "kind": "chapter", "title": "Rationality and Intelligence", "authors": ["Stuart Russell"], "container": "Mind Design III, ch. 8", "year": 2023},
    {"id": "boden-2006-ch7b", "kind": "chapter", "title": "Reasoning and rationality", "authors": ["Margaret Boden"], "container": "Mind as Machine, ch. 7.iv", "year": 2006},
    {"id": "fodor-1983", "kind": "chapter", "title": "Central Systems", "authors": ["Jerry Fodor"], "container": "Mind Design III, ch. 9", "year": 1983},
    {"id": "boden-2006-ch7c", "kind": "chapter", "title": "Nativism and its vicissitudes", "authors": ["Margaret Boden"], "container": "Mind as Machine, ch. 7.vi", "year": 2006},
    {"id": "rumelhart-1989", "kind": "chapter", "title": "The Architecture of Mind: A Connectionist Approach", "authors": ["David Rumelhart"], "container": "Mind Design III, ch. 19", "year": 1989},
    {"id": "boden-2006-ch12", "kind": "chapter", "title": "Connectionism: birth and renaissance", "authors": ["Margaret Boden"], "container": "Mind as Machine, ch. 12.i, 12.viii", "year": 2006},
    {"id": "churchland-sejnowski-1990", "kind": "chapter", "title": "The Computational Brain", "authors": ["Patricia Churchland", "Terrence Sejnowski"], "container": "Mind Design III, ch. 20", "year": 1990},
    {"id": "boden-2006-ch14", "kind": "chapter", "title": "Computational neuroscience; Cartesian correlations", "authors": ["Margaret Boden"], "container": "Mind as Machine, ch. 14.i, 14.x", "year": 2006},
    {"id": "haugeland-1995", "kind": "chapter", "title": "Mind Embodied and Embedded", "authors": ["John Haugeland"], "container": "Mind Design III, ch. 22", "year": 1995},
    {"id": "brooks-1991", "kind": "chapter", "title": "Intelligence without Representation", "authors": ["Rodney Brooks"], "container": "Mind Design III, ch. 23", "year": 1991},
    {"id": "boden-2006-ch15", "kind": "chapter", "title": "Vehicles to lampreys", "authors": ["Margaret Boden"], "container": "Mind as Machine, ch. 15.vii", "year": 2006},
    {"id": "webb-2023", "kind": "chapter", "title": "What Does Biorobotics Offer Philosophy?", "authors": ["Barbara Webb"], "container": "Mind Design III, ch. 24", "year": 2023},
]

# (week, date, title, source ids, period tag)
UNIT_ROWS = [
    (1, "2026-09-01", "Course intro; Haugeland, What Is Mind Design?", ["haugeland-2023"], None),
    (1, "2026-09-03", "Boden: Setting the scene; scope of cognitive science", ["boden-2006-ch1"], None),
    (2, "2026-09-08", "Boden: Descartes; Vaucanson; the neurophysiological machine", ["boden-2006-ch2"], None),
    (2, "2026-09-10", "Boden: Babbage's analytical engines", ["boden-2006-ch3"], None),
    (3, "2026-09-15", "Turing, Computing Machinery and Intelligence", ["turing-1950"], "gofai"),
    (3, "2026-09-17", "Boden: Turing; McCulloch-Pitts; the logical neurone", ["boden-2006-ch4a"], "cybernetic"),
    (4, "2026-09-22", "Boden: cybernetics; Craik; Walter; Ashby", ["boden-2006-ch4b"], "cybernetic"),
    (4, "2026-09-24", "Maley, The Analog Alternative", ["maley-2023"], "cybernetic"),
    (5, "2026-09-29", "Boden: the cognitive revolution", ["boden-2006-ch6"], "gofai"),
    (5, "2026-10-01", "Newell and Simon; Boden: When GOFAI was NewFAI", ["newell-simon-1976", "boden-2006-ch10"], "gofai"),
    (6, "2026-10-06", "Boden: AI winter, Of Bombs and Bombshells", ["boden-2006-ch11"], "gofai"),
    (6, "2026-10-08", "Marr, Vision; Boden: three levels, two types", ["marr-1982", "boden-2006-ch7a"], "gofai"),
    (7, "2026-10-15", "Searle, Minds, Brains, and Programs; Boden: that room in China", ["searle-1980", "boden-2006-ch16c"], "gofai"),
    (8, "2026-10-20", "Boden, Escaping from the Chinese Room; three variations", ["boden-1988", "boden-2006-ch16b"], "gofai"),
    (8, "2026-10-22", "Dennett, True Believers", ["dennett-1981"], "gofai"),
    (9, "2026-10-27", "Russell, Rationality and Intelligence; Boden: reasoning and rationality", ["russell-2023", "boden-2006-ch7b"], "gofai"),
    (9, "2026-10-29", "Fodor, Central Systems; Boden: nativism", ["fodor-1983", "boden-2006-ch7c"], "gofai"),
    (10, "2026-11-03", "Rumelhart, The Architecture of Mind; Boden: connectionism", ["rumelhart-1989", "boden-2006-ch12"], "connectionist"),
    (10, "2026-11-05", "Churchland and Sejnowski, The Computational Brain; Boden: computational neuroscience", ["churchland-sejnowski-1990", "boden-2006-ch14"], "computational-neuroscience"),
    (11, "2026-11-10", "Haugeland, Mind Embodied and Embedded", ["haugeland-1995"], "embodied"),
    (11, "2026-11-12", "Brooks, Intelligence without Representation; Boden: vehicles to lampreys", ["brooks-1991", "boden-2006-ch15"], "embodied"),
    (12, "2026-11-17", "Webb, What Does Biorobotics Offer Philosophy?", ["webb-2023"], "embodied"),
    (12, "2026-11-19", "Take-stock and open-weeks planning", [], None),
    (13, "2026-12-01", "OPEN: class choice", [], None),
    (13, "2026-12-03", "OPEN: class choice", [], None),
    (14, "2026-12-08", "OPEN: class choice", [], None),
    (14, "2026-12-10", "OPEN: class choice", [], None),
]

# --------------------------------------------------------------------------
# 5. Assignment presets and rubrics (brief 15.6, 15.7)
# --------------------------------------------------------------------------
CONSTRAINT_PRESETS = [
    {"id": "map-1", "title": "Map 1 (early term)", "directedness": "D2", "genre": "concept",
     "rules": [
         {"kind": "min_concepts", "value": 10},
         {"kind": "min_relations_per_concept", "value": 1},
         {"kind": "all_relations_labeled", "value": True},
     ]},
    {"id": "map-2", "title": "Map 2 (midterm)", "directedness": "D2", "genre": "concept",
     "rules": [
         {"kind": "min_concepts", "value": 15},
         {"kind": "min_unique_relations_per_concept", "value": 2},
         {"kind": "min_cross_links", "value": 2},
         {"kind": "justification_required_on_cross_links", "value": True},
     ]},
    {"id": "map-3", "title": "Map 3 (synthesis, open weeks)", "directedness": "D1", "genre": "concept",
     "revises": "diagnostic-map",
     "rules": [
         {"kind": "min_new_concepts_vs_baseline", "value": 8},
         {"kind": "min_new_cross_links_between_previously_unconnected_regions", "value": 3},
         {"kind": "min_anchored_propositions", "value": 3},
     ]},
    {"id": "chinese-room-argument", "title": "Argument map: the Chinese Room exchange (weeks 7-8)", "directedness": "D2", "genre": "argument",
     "rules": [
         {"kind": "root_fixed", "value": "c-chinese-room"},
         {"kind": "min_objections", "value": 3},
         {"kind": "replies_required", "value": ["Searle", "Boden"]},
         {"kind": "all_relations_in_family", "value": "dialectical"},
     ]},
]

RUBRIC_TEMPLATES = [
    {"id": "concept-map-rubric", "applies_to": ["map-1", "map-2"], "criteria": [
        {"id": "content-accuracy", "label": "Content accuracy", "levels": 4},
        {"id": "structure", "label": "Structural sophistication (network rather than spoke or chain; justified cross-links)", "levels": 4},
        {"id": "justifications", "label": "Quality of justifications", "levels": 4},
    ]},
    {"id": "argument-map-rubric", "applies_to": ["chinese-room-argument"], "criteria": [
        {"id": "content-accuracy", "label": "Content accuracy", "levels": 4},
        {"id": "dialectical-relations", "label": "Accurate dialectical relations", "levels": 4},
        {"id": "bottoms-out", "label": "Identifies where the dispute bottoms out", "levels": 4},
    ]},
    {"id": "synthesis-map-rubric", "applies_to": ["map-3"], "criteria": [
        {"id": "content-accuracy", "label": "Content accuracy", "levels": 4},
        {"id": "structure", "label": "Structural sophistication", "levels": 4},
        {"id": "change", "label": "Demonstrated change from the week-one baseline", "levels": 4},
        {"id": "justifications", "label": "Quality of justifications", "levels": 4},
    ]},
]

# --------------------------------------------------------------------------
# 6. Sentence-form parser (reference implementation of brief 5.7)
# --------------------------------------------------------------------------
LINE_RE = re.compile(
    r"^(?P<subj>.+?)\s*->\s*(?P<rel>.+?)\s*->\s*(?P<obj>[^@\[/]+?)"
    r"(?:\s*@(?P<conf>[1-5]))?"
    r"(?:\s*\[(?P<anchor>[^\]]*)\])?"
    r"(?:\s*//\s*(?P<just>.*))?\s*$"
)

def parse_sentence_map(text, concepts_by_norm, rels, rel_aliases, map_id, title, owner):
    by_label = {norm(r["label"]): (r, False) for r in rels}
    for r in rels:
        if r["inverse_label"]:
            by_label.setdefault(norm(r["inverse_label"]), (r, True))
    by_id = {r["id"]: r for r in rels}
    focus, props, novel, free = None, [], [], []
    used = {}
    n = 0
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"): continue
        if line.startswith("?"):
            focus = line[1:].strip(); continue
        if line.startswith(">"):
            continue  # submap naming; not used in the prototype
        m = LINE_RE.match(line)
        if not m:
            print("  ! could not parse:", line, file=sys.stderr); continue
        s_lab, r_lab, o_lab = m.group("subj").strip(), m.group("rel").strip(), m.group("obj").strip()
        r_free = r_lab.endswith("*")
        r_lab_clean = r_lab.rstrip("*").strip()

        def resolve_concept(lab):
            c = concepts_by_norm.get(norm(lab))
            if c:
                used[c["id"]] = c; return c["id"]
            cid = "c-novel-" + slug(lab)
            if cid not in used:
                used[cid] = {"id": cid, "label": lab, "type": "concept", "pack_id": None, "novel": True}
                novel.append(lab)
            return cid
        sid, oid = resolve_concept(s_lab), resolve_concept(o_lab)

        key = norm(r_lab_clean)
        swapped = False
        if key in by_label:
            rel, swapped = by_label[key]; relation = rel["id"]
        elif key in rel_aliases:
            relation = rel_aliases[key]
            if relation not in by_id:   # alias points at an inverse label (e.g. gave-rise-to)
                for r in rels:
                    if r["inverse_label"] and slug(r["inverse_label"]) == relation:
                        relation, swapped = r["id"], True; break
        else:
            relation = {"free": r_lab_clean}; free.append(r_lab_clean)
        if swapped: sid, oid = oid, sid
        n += 1
        p = {"id": f"p{n}", "subject": sid, "relation": relation, "object": oid,
             "confidence": int(m.group("conf")) if m.group("conf") else None,
             "justification": m.group("just").strip() if m.group("just") else None,
             "anchors": [], "learned_at": NOW, "holds_from": None, "holds_to": None,
             "status": "asserted", "author": owner, "derived_from": None,
             "as_written": {"subject": s_lab, "relation": r_lab_clean, "object": o_lab}}
        if m.group("anchor"):
            a = m.group("anchor").strip()
            am = re.match(r"^(\S+)\s+(.*)$", a)
            p["anchors"].append({"source_id": slug(am.group(1)) if am else slug(a), "locator": ("p. " + am.group(2)) if am else None})
        props.append(p)
    doc = {
        "id": map_id, "title": title, "focus_question": focus, "genre": "concept",
        "pack_id": PACK_ID, "owner": owner, "root": None,
        "concepts": [ {k: v for k, v in c.items() if k in ("id", "label", "type", "pack_id", "novel", "external_ids")} for c in used.values()],
        "propositions": props, "layout": {}, "submaps": {},
        "created_at": NOW,
    }
    return doc, novel, free

SEPT2_TXT = """# Instructor's whiteboard map, PHIL 2400, September 2, 2026
# Transcribed in the Vision and Architecture Brief, section 5.7.
# Relations marked * were free text on the whiteboard; the pack's alias table now resolves them.
? What is mind design?
Mind -> is constituted by -> Intentionality  @5  [haugeland-2023 14]
Intentionality -> is explained by -> Intentional Stance
Intentional Stance -> was invented by -> Dennett  [haugeland-2023 15]
Intentional Stance -> enables -> Intentional Interpretation
Intentional Interpretation -> applies to* -> Neural Networks  @3
Neural Networks -> gave rise to -> Connectionism
Neural Networks -> is implemented by -> ChatGPT  // "powers" in the original
GOFAI -> developed from* -> Formal System
Formal System -> is constituted by -> Rules
Rules -> is for manipulating* -> Tokens
NFAI -> developed from -> GOFAI
NFAI -> sees greatest hope in* -> Neural Networks
NFAI -> sees anti-representational leaning in* -> Embodied AI
Embodied AI -> has as an example -> Roomba
"""

STUDENT_TXT = """# Demo student map for the Replit session.
# Built to trigger every engine feature on cue: three shared propositions with the
# instructor's map, a transitive chain that implies "Roomba is an instance of Mind",
# one enables/prevents conflict, one type violation, and two disputes with the expert map.
? What is mind design?
Mind -> is constituted by -> Intentionality  @5  [haugeland-2023 14]
Intentionality -> is explained by -> Intentional Stance  @4
Intentional Stance -> was invented by -> Dennett  @5  [haugeland-2023 15]
NFAI -> is a kind of -> Mind  @2
Embodied AI -> is a kind of -> NFAI  @4  [haugeland-2023 31]
Roomba -> is an instance of -> Embodied AI  @5
GOFAI -> is a kind of -> Mind  @3
GOFAI -> is constituted by -> Formal System  @4  [haugeland-2023 23]
Formal System -> is constituted by -> Rules  @5  [haugeland-2023 17]
GOFAI -> enables -> Understanding  @2
GOFAI -> prevents -> Understanding  @3  [haugeland-2023 33]  // Haugeland's closing thesis
Turing test -> was invented by -> GOFAI  @1
"""

# --------------------------------------------------------------------------
def main():
    text = KEY_TERMS.read_text(encoding="utf-8")
    concepts, by_norm = parse_key_terms(text)

    # extras (merge by label)
    for label, aliases, ctype, definition, tags in EXTRA:
        key = norm(label)
        if key in by_norm:
            c = by_norm[key]
            for a in aliases:
                if a not in c["aliases"]: c["aliases"].append(a)
            if ctype != "core-concept": c["type"] = ctype
        else:
            c = {"id": "c-" + slug(label), "label": label, "aliases": aliases, "type": ctype,
                 "definition": definition or "", "sources": [], "external_ids": {}, "tags": tags,
                 "pack_id": PACK_ID, "created_at": NOW, "created_by": "instructor"}
            concepts.append(c); by_norm[key] = c
        for a in c["aliases"]:
            by_norm.setdefault(norm(a), c)

    for c in concepts:
        if c["label"] in QIDS: c["external_ids"]["wikidata"] = QIDS[c["label"]]
        if c["label"] in PERIOD_TAGS: c["tags"].append(PERIOD_TAGS[c["label"]])
        c["tags"] = sorted(set(t for t in c["tags"] if t))

    rels = build_relations()

    # texts as concepts too (type "text"), so "is discussed in" has targets
    for s in SOURCES[:2]:
        concepts.append({"id": "c-text-" + s["id"], "label": f'{s["authors"][0].split()[-1]}, "{s["title"]}"',
                         "aliases": [s["id"]], "type": "text", "definition": s["container"], "sources": [{"source_id": s["id"]}],
                         "external_ids": {}, "tags": [], "pack_id": PACK_ID, "created_at": NOW, "created_by": "instructor"})

    # units: attach concepts introduced in units 1 and 2 by reading tag
    units = []
    for i, (wk, date, title, srcs, period) in enumerate(UNIT_ROWS, start=1):
        tag = "reading-1" if i == 1 else "reading-2" if i == 2 else None
        introduced = [c["id"] for c in concepts if tag and tag in c["tags"]] if tag else []
        units.append({"id": f"u{i:02d}", "week": wk, "date": date, "title": title,
                      "sources": srcs, "concepts_introduced": introduced, "period_tag": period,
                      "expert_map": "map-sept2-expert" if i == 1 else None})

    pack = {
        "id": PACK_ID, "title": "PHIL 2400: Minds and Machines (Fall 2026)", "version": "0.1.0",
        "license": "CC-BY-4.0", "authors": ["Collin Lucken, Bowdoin College"],
        "format_version": "0.1",
        "concept_types": [
            {"id": "concept", "label": "Concept", "universal": True},
            {"id": "figure", "label": "Figure", "universal": True},
            {"id": "text", "label": "Text", "universal": True},
            {"id": "example", "label": "Example", "universal": True},
            {"id": "core-concept", "label": "Core concept", "color": "#2f6fdd", "extends": "concept"},
            {"id": "research-paradigm", "label": "Research paradigm", "color": "#c0392b", "extends": "concept"},
            {"id": "system-or-example", "label": "System or example", "color": "#2e8b57", "extends": "example"},
        ],
        "concepts": concepts,
        "relations": rels,
        "alias_table": {"relations": RELATION_ALIASES, "concepts": {}},
        "inference": {
            "inheritable_relations": ["is-an-instance-of", "is-an-example-of"],
            "inherit_along": "is-a-kind-of",
            "structure_thresholds": {"spoke": 0.5, "chain": 0.5, "network_min_cross_links": 1},
        },
        "sources": SOURCES,
        "units": units,
        "expert_maps": [{"id": "map-sept2-expert", "file": "maps/sept2-expert.map.json", "unit": "u01", "visibility": "after_submission"}],
        "constraint_presets": CONSTRAINT_PRESETS,
        "rubric_templates": RUBRIC_TEMPLATES,
        "flashcard_policy": {"source": "learner_map", "blank": ["object", "subject", "relation"], "distractors": "same_type_same_unit", "boxes": [1, 3, 7, 14, 30]},
    }

    out_pack = PREP / "pack" / f"{PACK_ID}.pack.json"
    out_pack.write_text(json.dumps(pack, indent=2, ensure_ascii=False), encoding="utf-8")

    # maps
    for fname, txt, mid, title, owner in [
        ("sept2-expert", SEPT2_TXT, "map-sept2-expert", "What is mind design? (instructor, Sept 2)", "instructor"),
        ("student-demo", STUDENT_TXT, "map-student-demo", "What is mind design? (demo student)", "student-demo"),
    ]:
        (PREP / "maps" / f"{fname}.map.txt").write_text(txt, encoding="utf-8")
        doc, novel, free = parse_sentence_map(txt, by_norm, rels, RELATION_ALIASES, mid, title, owner)
        (PREP / "maps" / f"{fname}.map.json").write_text(json.dumps(doc, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"{fname}: {len(doc['concepts'])} concepts, {len(doc['propositions'])} propositions; novel concepts: {novel or 'none'}; free relations: {free or 'none'}")

    from collections import Counter
    print(f"pack: {len(concepts)} concepts {dict(Counter(c['type'] for c in concepts))}; {len(rels)} relations; {len(units)} units; {len(SOURCES)} sources")
    print("wrote", out_pack.relative_to(COURSE))

if __name__ == "__main__":
    main()
