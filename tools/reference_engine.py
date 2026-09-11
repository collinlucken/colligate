#!/usr/bin/env python3
"""Tiny reference implementation of the engine (brief section 6) used to produce
EXPECTED_OUTPUTS.md. Not the product; a checker for what the product should say."""
import json, sys, itertools
from collections import defaultdict, deque
from pathlib import Path
PREP = Path(__file__).resolve().parent.parent
pack = json.load(open(PREP/"pack/phil2400-f26.pack.json"))
REL = {r["id"]: r for r in pack["relations"]}
CON = {c["id"]: c for c in pack["concepts"]}
INH = pack["inference"]

def label(cid): return CON[cid]["label"] if cid in CON else cid
def rlabel(r): return r["free"]+"*" if isinstance(r, dict) else REL[r]["label"]

def structure(m):
    props = m["propositions"]; nodes = [c["id"] for c in m["concepts"]]
    deg = defaultdict(int); adj = defaultdict(set)
    for p in props:
        deg[p["subject"]] += 1; deg[p["object"]] += 1
        adj[p["subject"]].add(p["object"]); adj[p["object"]].add(p["subject"])
    # components
    seen, comps = set(), 0
    for n in nodes:
        if n in seen: continue
        comps += 1; q = deque([n]); seen.add(n)
        while q:
            x = q.popleft()
            for y in adj[x]:
                if y not in seen: seen.add(y); q.append(y)
    cycles = len(props) - len(nodes) + comps
    # diameter (unweighted, undirected)
    def bfs(s):
        d = {s: 0}; q = deque([s])
        while q:
            x = q.popleft()
            for y in adj[x]:
                if y not in d: d[y] = d[x] + 1; q.append(y)
        return d
    diam = max(max(bfs(n).values()) for n in nodes)
    hub = max(nodes, key=lambda n: deg[n])
    spoke = deg[hub] / len(props)
    chain = sum(1 for n in nodes if deg[n] == 2) / len(nodes)
    # roots by hierarchy weight
    down_in = defaultdict(int)
    for p in props:
        r = p["relation"]
        if isinstance(r, dict): continue
        hw = REL[r]["hierarchy_weight"]
        if hw == +1: down_in[p["object"]] += 1
        elif hw == -1: down_in[p["subject"]] += 1
    roots = [n for n in nodes if down_in[n] == 0]
    free = [p for p in props if isinstance(p["relation"], dict)]
    weak = [p for p in props if p["relation"] == "is-related-to"]
    orphans = [n for n in nodes if deg[n] == 0]
    return dict(concepts=len(nodes), propositions=len(props), components=comps, cycles=cycles,
                diameter=diam, hub=label(hub), hub_degree=deg[hub], spoke=round(spoke,2), chain=round(chain,2),
                degree2=sum(1 for n in nodes if deg[n]==2), roots=[label(r) for r in roots],
                free=len(free), weak=len(weak), orphans=orphans,
                density=round(len(props)/len(nodes),2),
                degrees={label(n): deg[n] for n in sorted(nodes, key=lambda n:-deg[n])})

def infer(m):
    props = m["propositions"]
    asserted = {(p["subject"], p["relation"], p["object"]) for p in props if not isinstance(p["relation"], dict)}
    implied = {}
    facts = set(asserted)
    changed = True
    while changed:
        changed = False
        for (a, r, b), (c, s, d) in itertools.product(list(facts), list(facts)):
            if REL[r]["transitive"] and r == s and b == c and a != d:
                t = (a, r, d)
                if t not in facts: facts.add(t); implied[t] = f"{label(a)} {rlabel(r)} {label(b)}; {label(b)} {rlabel(r)} {label(d)} ({rlabel(r)} is transitive)"; changed = True
            if r in INH["inheritable_relations"] and s == INH["inherit_along"] and b == c:
                t = (a, r, d)
                if t not in facts: facts.add(t); implied[t] = f"{label(a)} {rlabel(r)} {label(b)}; {label(b)} {rlabel(s)} {label(d)} ({rlabel(r)} inherits along {rlabel(s)})"; changed = True
    conflicts = []
    for (a, r, b) in facts:
        for s in REL[r]["incompatible_with"]:
            if (a, s, b) in facts and r < s: conflicts.append(f"{label(a)} {rlabel(r)} {label(b)}  vs  {label(a)} {rlabel(s)} {label(b)}")
    cyc = [f"{label(a)} {rlabel(r)} {label(a)}" for (a, r, b) in facts if a == b]
    ill = []
    for p in props:
        r = p["relation"]
        if isinstance(r, dict): continue
        st, ot = REL[r]["subject_types"], REL[r]["object_types"]
        s_t, o_t = CON[p["subject"]]["type"], CON[p["object"]]["type"]
        if (st and s_t not in st) or (ot and o_t not in ot):
            ill.append(f"{label(p['subject'])} ({s_t}) {rlabel(r)} {label(p['object'])} ({o_t}); relation requires {st or 'any'} -> {ot or 'any'}")
    return dict(implied=[f"{label(a)} {rlabel(r)} {label(b)}   <- {why}" for (a,r,b),why in implied.items()], conflicts=conflicts, taxonomic_cycles=cyc, ill_typed=ill)

def canon(p):
    r = p["relation"]
    if isinstance(r, dict): return (p["subject"], "free:"+r["free"], p["object"])
    return (p["subject"], r, p["object"])

def compare(a, b):
    A = {canon(p) for p in a["propositions"]}; B = {canon(p) for p in b["propositions"]}
    shared = A & B; only_a = A - B; only_b = B - A
    pair = lambda t: frozenset((t[0], t[2]))
    disputes = []
    for x in only_a:
        for y in only_b:
            if pair(x) == pair(y): disputes.append((x, y))
    recall = len(shared)/len(B); precision = len(shared)/len(A)
    f1 = 2*precision*recall/(precision+recall) if precision+recall else 0
    # Goldsmith closeness: neighbour-set Jaccard per concept, averaged over union of concepts
    def nbrs(m):
        n = defaultdict(set)
        for p in m["propositions"]: n[p["subject"]].add(p["object"]); n[p["object"]].add(p["subject"])
        return n
    na, nb = nbrs(a), nbrs(b)
    ca, cb = set(na), set(nb)
    allc = ca | cb
    jac = []
    for c in allc:
        u = na[c] | nb[c]; i = na[c] & nb[c]
        jac.append(len(i)/len(u) if u else 1)
    fmt = lambda t: f"{label(t[0])} -> {t[1] if t[1].startswith('free:') else REL[t[1]]['label']} -> {label(t[2])}"
    return dict(shared=[fmt(t) for t in shared], only_student=[fmt(t) for t in only_a], only_expert=[fmt(t) for t in only_b],
                disputes=[f"{fmt(x)}   vs   {fmt(y)}" for x,y in disputes],
                recall=round(recall,2), precision=round(precision,2), f1=round(f1,2), goldsmith=round(sum(jac)/len(jac),2),
                concepts_shared=len(ca&cb), concepts_student=len(ca), concepts_expert=len(cb))

if __name__ == "__main__":
    e = json.load(open(PREP/"maps/sept2-expert.map.json")); s = json.load(open(PREP/"maps/student-demo.map.json"))
    out = {"sept2_expert": {"structure": structure(e), "inference": infer(e)},
           "student_demo": {"structure": structure(s), "inference": infer(s)},
           "compare_student_vs_expert": compare(s, e)}
    print(json.dumps(out, indent=2, ensure_ascii=False))
