import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Download, FileDown, HelpCircle, LayoutGrid, Plus, Search, X } from "lucide-react";
import helpText from "../data/HELP.md?raw";
import { diagnoseStructure } from "./engine";
import { clipLineToRectangles, SVG_NODE_RECT_SIZE, SVG_VIEWBOX, scaleSizeToViewBox, type Size } from "./geometry";
import "./index.css";

type AnyMap = any;
type ManualConcept = { id: string; label: string; type: string; pack_id: null };
type ManualRelation = {
  id: string;
  label: string;
  family: "user";
  inverse_label: null;
  directed: true;
  symmetric: false;
  transitive: false;
  incompatible_with: string[];
  subject_types: string[];
  object_types: string[];
  hierarchy_weight: 0;
  description: string;
};

const MANUAL_PACK_ID = "manual-user-authorship";
const MANUAL_MAP_STORAGE = "weft-manual-map";
const MANUAL_CONCEPT_BANK_STORAGE = "weft-manual-concept-bank";
const MANUAL_RELATION_BANK_STORAGE = "weft-manual-relation-bank";
const LEGACY_MAP_STORAGE = "weft-map";
const conceptTypes = ["novel", "core-concept", "research-paradigm", "system-or-example", "figure", "text"];
const colors: Record<string, string> = {
  "core-concept": "#2f6fdd",
  "research-paradigm": "#b85a51",
  "system-or-example": "#5c9271",
  figure: "#899196",
  text: "#be8c40",
  novel: "#69639a",
};

const emptyManualPack = {
  id: MANUAL_PACK_ID,
  title: "User-created relations",
  concepts: [],
  relations: [],
  inference: { inheritable_relations: [], inherit_along: "" },
};

function createInitialMap(now = new Date().toISOString()): AnyMap {
  return {
    id: "map-new",
    title: "Untitled map",
    focus_question: "What are you trying to understand?",
    genre: "concept",
    pack_id: MANUAL_PACK_ID,
    concepts: [],
    propositions: [],
    layout: {},
    submaps: {},
    meta: {
      created_at: now,
      last_saved_at: now,
      session_seconds: 0,
      edit_count: 0,
      added_by: { typed: 0, drawn: 0, accepted_inference: 0 },
    },
  };
}

function normalizeMap(raw: any): AnyMap {
  const now = new Date().toISOString();
  const meta = raw?.meta || {};
  const concepts = Array.isArray(raw?.concepts)
    ? raw.concepts.map((concept: any, index: number) => ({
      ...concept,
      id: concept?.id || `concept-loaded-${index + 1}`,
      label: String(concept?.label || concept?.id || `Concept ${index + 1}`),
      type: concept?.type || "novel",
      pack_id: concept?.pack_id ?? null,
    }))
    : [];
  const propositions = Array.isArray(raw?.propositions)
    ? raw.propositions.map((proposition: any, index: number) => ({
      ...proposition,
      id: proposition?.id || `p-loaded-${index + 1}`,
      subject: proposition?.subject,
      relation: proposition?.relation,
      object: proposition?.object,
      confidence: proposition?.confidence ?? null,
      justification: proposition?.justification ?? null,
      anchors: proposition?.anchors || [],
      learned_at: proposition?.learned_at || now,
      holds_from: proposition?.holds_from ?? null,
      holds_to: proposition?.holds_to ?? null,
      status: proposition?.status || "asserted",
      derived_from: proposition?.derived_from ?? null,
    }))
    : [];
  return {
    ...raw,
    id: raw?.id || `map-${Date.now()}`,
    title: raw?.title || "Untitled map",
    focus_question: raw?.focus_question || "",
    genre: "concept",
    pack_id: raw?.pack_id || MANUAL_PACK_ID,
    concepts,
    propositions,
    layout: raw?.layout || {},
    submaps: raw?.submaps || {},
    meta: {
      created_at: meta.created_at || now,
      last_saved_at: meta.last_saved_at || now,
      session_seconds: meta.session_seconds || 0,
      edit_count: meta.edit_count || 0,
      ...meta,
      added_by: {
        typed: meta.added_by?.typed || 0,
        drawn: meta.added_by?.drawn || 0,
        accepted_inference: meta.added_by?.accepted_inference || 0,
        ...meta.added_by,
      },
    },
  };
}

function readStoredMap(): { map: AnyMap; restoredLegacy: boolean } {
  const manual = localStorage.getItem(MANUAL_MAP_STORAGE);
  const legacy = localStorage.getItem(LEGACY_MAP_STORAGE);
  const stored = manual || legacy;
  if (!stored) return { map: createInitialMap(), restoredLegacy: false };
  try {
    return { map: normalizeMap(JSON.parse(stored)), restoredLegacy: !manual && Boolean(legacy) };
  } catch {
    return { map: createInitialMap(), restoredLegacy: false };
  }
}

function readStoredBank<T>(key: string, fallback: T[]): T[] {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return fallback;
    const value = JSON.parse(stored);
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "item";
}

function uniqueId(prefix: string, label: string, existing: { id: string }[]): string {
  const base = `${prefix}-${slug(label)}`;
  const ids = new Set(existing.map(item => item.id));
  let id = base;
  let suffix = 2;
  while (ids.has(id)) id = `${base}-${suffix++}`;
  return id;
}

function makeConcept(label: string, type: string, existing: ManualConcept[]): ManualConcept {
  return { id: uniqueId("concept", label, existing), label, type, pack_id: null };
}

function makeRelation(label: string, existing: ManualRelation[]): ManualRelation {
  return {
    id: uniqueId("relation", label, existing),
    label,
    family: "user",
    inverse_label: null,
    directed: true,
    symmetric: false,
    transitive: false,
    incompatible_with: [],
    subject_types: [],
    object_types: [],
    hierarchy_weight: 0,
    description: "A relation created by the map author.",
  };
}

function normalizeConceptBank(raw: any[]): ManualConcept[] {
  const seen = new Set<string>();
  return raw
    .filter(item => item && typeof item.label === "string" && item.label.trim())
    .map((item, index) => ({
      id: String(item.id || `concept-${slug(item.label)}-${index + 1}`),
      label: item.label.trim(),
      type: conceptTypes.includes(item.type) ? item.type : "novel",
      pack_id: null,
    }))
    .filter(item => !seen.has(item.id) && seen.add(item.id));
}

function normalizeRelationBank(raw: any[]): ManualRelation[] {
  const seen = new Set<string>();
  return raw
    .filter(item => item && typeof item.label === "string" && item.label.trim())
    .map((item, index) => ({
      ...makeRelation(item.label.trim(), []),
      ...item,
      id: String(item.id || `relation-${slug(item.label)}-${index + 1}`),
      label: item.label.trim(),
      family: "user" as const,
      inverse_label: null,
      directed: true as const,
      symmetric: false as const,
      transitive: false as const,
      incompatible_with: [],
      subject_types: [],
      object_types: [],
      hierarchy_weight: 0 as const,
      description: item.description || "A relation created by the map author.",
    }))
    .filter(item => !seen.has(item.id) && seen.add(item.id));
}

function download(name: string, contents: string, type = "application/json") {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([contents], { type }));
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function relationLabel(relation: any, relations: ManualRelation[], writtenLabel?: string): string {
  if (typeof relation === "object") return relation?.free || relation?.label || "unnamed relation";
  return relations.find(item => item.id === relation)?.label || writtenLabel || String(relation || "unnamed relation");
}

function conceptLabel(id: string, map: AnyMap): string {
  return map.concepts?.find((concept: any) => concept.id === id)?.label || id;
}

function propositionText(proposition: any, map: AnyMap, relations: ManualRelation[]): string {
  return `${conceptLabel(proposition.subject, map)} ${relationLabel(proposition.relation, relations, proposition.as_written?.relation)} ${conceptLabel(proposition.object, map)}`;
}

function xmlEsc(value: string): string {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  }[character]!));
}

function App() {
  const restored = useMemo(readStoredMap, []);
  const [map, setMap] = useState<AnyMap>(restored.map);
  const [conceptBank, setConceptBank] = useState<ManualConcept[]>(() => normalizeConceptBank(readStoredBank(MANUAL_CONCEPT_BANK_STORAGE, [])));
  const [relationBank, setRelationBank] = useState<ManualRelation[]>(() => normalizeRelationBank(readStoredBank(MANUAL_RELATION_BANK_STORAGE, [])));
  const [conceptLabelInput, setConceptLabelInput] = useState("");
  const [conceptTypeInput, setConceptTypeInput] = useState("novel");
  const [relationLabelInput, setRelationLabelInput] = useState("");
  const [query, setQuery] = useState("");
  const [help, setHelp] = useState(false);
  const [helpTab, setHelpTab] = useState("students");
  const [showWork, setShowWork] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const [storageNotice, setStorageNotice] = useState(restored.restoredLegacy);
  const mapRef = useRef(map);
  const lastEditAt = useRef(Date.now());
  const previousEditCount = useRef(map.meta?.edit_count || 0);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [nodeSizes, setNodeSizes] = useState<Record<string, Size>>({});
  const manualPack = useMemo(() => ({
    ...emptyManualPack,
    relations: relationBank,
  }), [relationBank]);

  const measureNodes = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    if (!canvasRect.width || !canvasRect.height) return;
    const measured: Record<string, Size> = {};
    for (const concept of map.concepts) {
      const node = nodeRefs.current[concept.id];
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      measured[concept.id] = scaleSizeToViewBox(
        { width: rect.width, height: rect.height },
        { width: canvasRect.width, height: canvasRect.height },
        SVG_VIEWBOX,
      );
    }
    setNodeSizes(previous => {
      const keys = Object.keys(measured);
      const previousKeys = Object.keys(previous);
      if (keys.length === previousKeys.length && keys.every(id => previous[id]?.width === measured[id].width && previous[id]?.height === measured[id].height)) {
        return previous;
      }
      return measured;
    });
  };

  useLayoutEffect(() => {
    measureNodes();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureNodes);
    observer.observe(canvas);
    for (const concept of map.concepts) {
      const node = nodeRefs.current[concept.id];
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [map.concepts]);

  useEffect(() => {
    mapRef.current = map;
    localStorage.setItem(MANUAL_MAP_STORAGE, JSON.stringify(map));
    localStorage.setItem(MANUAL_CONCEPT_BANK_STORAGE, JSON.stringify(conceptBank));
    localStorage.setItem(MANUAL_RELATION_BANK_STORAGE, JSON.stringify(relationBank));
    if ((map.meta?.edit_count || 0) !== previousEditCount.current) {
      previousEditCount.current = map.meta?.edit_count || 0;
      lastEditAt.current = Date.now();
    }
  }, [map, conceptBank, relationBank]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastEditAt.current < 300000) {
        setMap((current: AnyMap) => ({
          ...current,
          meta: { ...current.meta, session_seconds: (current.meta?.session_seconds || 0) + 1 },
        }));
      }
    }, 1000);
    return () => window.clearInterval(tick);
  }, []);

  const structure: any = useMemo(() => diagnoseStructure(map, manualPack as any), [map, manualPack]);
  const bank = useMemo(
    () => conceptBank.filter(concept => concept.label.toLowerCase().includes(query.toLowerCase())).slice(0, 24),
    [conceptBank, query],
  );
  const pos = (id: string, index: number) => map.layout?.[id] || {
    x: 70 + (index % 4) * 170,
    y: 90 + Math.floor(index / 4) * 95,
  };
  const toggle = (id: string) => setShowWork(current => ({ ...current, [id]: !current[id] }));

  const addConcept = (concept: ManualConcept, at?: { x: number; y: number }) => {
    if (mapRef.current.concepts.some((item: any) => item.id === concept.id)) return;
    lastEditAt.current = Date.now();
    setMap((current: AnyMap) => ({
      ...current,
      concepts: [...current.concepts, concept],
      layout: {
        ...current.layout,
        [concept.id]: at || {
          x: 180 + (current.concepts.length % 4) * 150,
          y: 130 + Math.floor(current.concepts.length / 4) * 90,
        },
      },
      meta: { ...current.meta, edit_count: (current.meta?.edit_count || 0) + 1 },
    }));
  };

  const addRelation = (relation: ManualRelation) => {
    if (selected.length !== 2) return;
    const [subject, object] = selected;
    const proposition = {
      id: `p-${Date.now()}`,
      subject,
      relation: { free: relation.label },
      object,
      confidence: null,
      justification: null,
      anchors: [],
      learned_at: new Date().toISOString(),
      holds_from: null,
      holds_to: null,
      status: "asserted",
      derived_from: null,
    };
    lastEditAt.current = Date.now();
    setMap((current: AnyMap) => ({
      ...current,
      propositions: [...current.propositions, proposition],
      meta: {
        ...current.meta,
        edit_count: (current.meta?.edit_count || 0) + 1,
        added_by: { ...current.meta.added_by, drawn: (current.meta?.added_by?.drawn || 0) + 1 },
      },
    }));
    setSelected([]);
    setPicker(null);
  };

  const addConceptToBank = (event: React.FormEvent) => {
    event.preventDefault();
    const label = conceptLabelInput.trim();
    if (!label) return;
    if (conceptBank.some(concept => concept.label.toLowerCase() === label.toLowerCase())) {
      setConceptLabelInput("");
      return;
    }
    setConceptBank(current => [...current, makeConcept(label, conceptTypeInput, current)]);
    setConceptLabelInput("");
    lastEditAt.current = Date.now();
  };

  const addRelationToBank = (event: React.FormEvent) => {
    event.preventDefault();
    const label = relationLabelInput.trim();
    if (!label) return;
    if (relationBank.some(relation => relation.label.toLowerCase() === label.toLowerCase())) {
      setRelationLabelInput("");
      return;
    }
    setRelationBank(current => [...current, makeRelation(label, current)]);
    setRelationLabelInput("");
    lastEditAt.current = Date.now();
  };

  const autoLayout = () => {
    const columns = Math.max(1, Math.ceil(Math.sqrt(map.concepts.length)));
    const layout: Record<string, { x: number; y: number }> = {};
    map.concepts.forEach((concept: any, index: number) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      layout[concept.id] = {
        x: 80 + (column * 640) / Math.max(columns, 1),
        y: 75 + row * 105,
      };
    });
    setMap((current: AnyMap) => ({
      ...current,
      layout,
      meta: { ...current.meta, edit_count: (current.meta?.edit_count || 0) + 1 },
    }));
    lastEditAt.current = Date.now();
  };

  const save = () => download(`${(map.title || "colligate-map").replace(/\s+/g, "-")}.map.json`, JSON.stringify(map, null, 2));

  const exportSvg = () => {
    const edges = map.propositions.map((proposition: any) => {
      const a = pos(proposition.subject, map.concepts.findIndex((concept: any) => concept.id === proposition.subject));
      const b = pos(proposition.object, map.concepts.findIndex((concept: any) => concept.id === proposition.object));
      const edge = clipLineToRectangles(a, b, SVG_NODE_RECT_SIZE, SVG_NODE_RECT_SIZE);
      return `<g><line x1="${edge.start.x}" y1="${edge.start.y}" x2="${edge.end.x}" y2="${edge.end.y}" stroke="#899694" stroke-width="1.5" marker-end="url(#arrow)"/><text x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 7}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#465654">${xmlEsc(relationLabel(proposition.relation, relationBank, proposition.as_written?.relation))}</text></g>`;
    }).join("");
    const nodes = map.concepts.map((concept: any, index: number) => {
      const point = pos(concept.id, index);
      const label = xmlEsc(concept.label);
      const type = xmlEsc(String(concept.type || "novel").replace(/-/g, " "));
      return `<g transform="translate(${point.x - 70} ${point.y - 22})"><rect width="140" height="44" rx="5" fill="#fffdf8" stroke="${colors[concept.type] || "#6e7b7b"}" stroke-width="2"/><text x="70" y="19" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="600" fill="#243b3c">${label}</text><text x="70" y="34" text-anchor="middle" font-family="sans-serif" font-size="8" fill="#687775">${type}</text></g>`;
    }).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="1200" height="900"><rect width="800" height="600" fill="#f8f6f0"/><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#899694"/></marker></defs>${edges}${nodes}</svg>`;
    download("colligate-map.svg", svg, "image/svg+xml");
  };

  const nodeSize = (id: string) => nodeSizes[id] || SVG_NODE_RECT_SIZE;
  const clippedEdge = (subject: string, object: string) => {
    const a = pos(subject, map.concepts.findIndex((concept: any) => concept.id === subject));
    const b = pos(object, map.concepts.findIndex((concept: any) => concept.id === object));
    return clipLineToRectangles(a, b, nodeSize(subject), nodeSize(object));
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag) return;
    const canvas = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (event.clientX - canvas.left) * 800 / canvas.width - drag.dx;
    const y = (event.clientY - canvas.top) * 600 / canvas.height - drag.dy;
    setMap((current: AnyMap) => ({
      ...current,
      layout: {
        ...current.layout,
        [drag.id]: { x: Math.max(20, Math.min(780, x)), y: Math.max(20, Math.min(580, y)) },
      },
    }));
  };
  const finishDrag = () => {
    if (!drag) return;
    setMap((current: AnyMap) => ({
      ...current,
      meta: { ...current.meta, edit_count: (current.meta?.edit_count || 0) + 1 },
    }));
    lastEditAt.current = Date.now();
    setDrag(null);
  };
  const updateFocus = (focus_question: string) => {
    setMap((current: AnyMap) => ({
      ...current,
      focus_question,
      meta: { ...current.meta, edit_count: (current.meta?.edit_count || 0) + 1 },
    }));
    lastEditAt.current = Date.now();
  };
  const panelWork = (id: string, derivation: any) => showWork[id]
    ? <div className="derivation">{Array.isArray(derivation) ? derivation.join("\n") : String(derivation || "Counted directly from the propositions you added.")}</div>
    : null;
  const helpSection = (section: "students" | "instructors") => {
    const heading = section === "students" ? "## For students" : "## For instructors";
    const other = section === "students" ? "## For instructors" : "## For students";
    const start = helpText.indexOf(heading);
    const end = helpText.indexOf(other, start + heading.length);
    return helpText.slice(start + heading.length, end < 0 ? undefined : end).trim();
  };

  return <div className="shell" onClick={() => picker && setPicker(null)}>
    <header className="topbar">
      <div className="brand">COLLIGATE <small>MANUAL CONCEPT MAPS</small></div>
      <div className="focus"><label>Focus question</label><input value={map.focus_question || ""} onChange={event => updateFocus(event.target.value)} /></div>
      <div className="toolbar">
        <button className="btn primary" onClick={save}><Download size={14} />Save map</button>
        <button className="btn ghost" onClick={exportSvg}><FileDown size={14} />Export SVG</button>
        <button className="btn ghost" onClick={() => setHelp(true)}><HelpCircle size={14} />Help</button>
      </div>
    </header>
    <main className="workspace">
      <section className="pane proposition-pane">
        <div className="pane-head">
          <div>
            <div className="eyebrow">01 / propositions</div>
            <h2>Your map in sentences</h2>
            <div className="subtle">Read-only record of the arrows you add on the canvas.</div>
          </div>
          <span className="pill">{map.propositions.length} propositions</span>
        </div>
        {storageNotice && <div className="storage-notice" role="status">
          An existing map was restored from older local storage. Its saved concepts and propositions are preserved; this workspace has empty user-created banks and never loads a course pack.
          <button className="work" onClick={() => setStorageNotice(false)}>hide</button>
        </div>}
        <div className="proposition-list" aria-label="Read-only propositions">
          {!map.propositions.length && <div className="proposition-empty">Add concepts to your bank, place them on the canvas, select two nodes, and add a relation.</div>}
          {map.propositions.map((proposition: any) => <div className="proposition" key={proposition.id}>
            <span className="proposition-index">{proposition.id}</span>
            <strong>{propositionText(proposition, map, relationBank)}</strong>
          </div>)}
        </div>
        <div className="meta-line"><strong>About this map</strong> · {map.concepts.length} concepts · {map.propositions.length} propositions · built over {Math.floor((map.meta?.session_seconds || 0) / 60)} min · {map.meta?.edit_count || 0} edits · saved locally</div>
        <div className="authoring">
          <div className="eyebrow">Create your vocabulary</div>
          <form className="authoring-form" aria-label="Add concept" onSubmit={addConceptToBank}>
            <label htmlFor="concept-label">Add concept</label>
            <div className="form-row">
              <input id="concept-label" value={conceptLabelInput} onChange={event => setConceptLabelInput(event.target.value)} placeholder="Concept label" />
              <select aria-label="Concept type" value={conceptTypeInput} onChange={event => setConceptTypeInput(event.target.value)}>
                {conceptTypes.map(type => <option key={type} value={type}>{type.replace(/-/g, " ")}</option>)}
              </select>
              <button className="btn small" type="submit"><Plus size={13} />Add concept</button>
            </div>
          </form>
          <div className="bank bank-inline">
            <div className="bank-heading"><span className="eyebrow">Your concept bank · {conceptBank.length}</span><span className="subtle">Click or drag to place</span></div>
            <div style={{ position: "relative" }}><Search size={13} style={{ position: "absolute", top: 12, left: 9, color: "#8a9791" }} /><input className="search" style={{ paddingLeft: 28 }} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search your concepts" /></div>
            <div className="chips">
              {bank.map(concept => <button className="chip" draggable key={concept.id} onDragStart={event => event.dataTransfer.setData("application/x-weft-concept", concept.id)} onClick={() => addConcept(concept)} title="Click or drag onto canvas"><Plus size={11} />{concept.label}</button>)}
              {!conceptBank.length && <span className="bank-empty">No concepts yet. Add your first one above.</span>}
              {!!conceptBank.length && !bank.length && <span className="bank-empty">No matching concepts.</span>}
            </div>
          </div>
          <form className="authoring-form" aria-label="Add relation" onSubmit={addRelationToBank}>
            <label htmlFor="relation-label">Add relation</label>
            <div className="form-row">
              <input id="relation-label" value={relationLabelInput} onChange={event => setRelationLabelInput(event.target.value)} placeholder="Relation label" />
              <button className="btn small" type="submit"><Plus size={13} />Add relation</button>
            </div>
          </form>
          <div className="relation-bank"><span className="eyebrow">Your relation bank · {relationBank.length}</span><div className="chips">
            {relationBank.map(relation => <span className="chip relation-chip" key={relation.id}>{relation.label}</span>)}
            {!relationBank.length && <span className="bank-empty">No relations yet. Add one before connecting nodes.</span>}
          </div></div>
        </div>
      </section>
      <section className="pane canvas-pane">
        <div className="canvas-tools"><div><div className="eyebrow">02 / canvas</div><div className="subtle">Place concepts, then click two nodes to add an arrow</div></div><button className="btn" style={{ color: "#435358", borderColor: "#c4cbc5" }} onClick={autoLayout}><LayoutGrid size={14} />Auto-layout</button></div>
        <div
          ref={canvasRef}
          className="canvas"
          onPointerMove={onPointerMove}
          onPointerUp={finishDrag}
          onDragOver={event => event.preventDefault()}
          onDrop={event => {
            event.preventDefault();
            const id = event.dataTransfer.getData("application/x-weft-concept");
            const concept = conceptBank.find(item => item.id === id);
            if (!concept) return;
            const rect = event.currentTarget.getBoundingClientRect();
            addConcept(concept, { x: (event.clientX - rect.left) * 800 / rect.width, y: (event.clientY - rect.top) * 600 / rect.height });
          }}
          onClick={() => {
            setSelected([]);
            setPicker(null);
          }}
        >
          <svg ref={svgRef} viewBox="0 0 800 600" preserveAspectRatio="none">
            <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#9aa5a3" /></marker></defs>
            {map.propositions.map((proposition: any) => {
              const a = pos(proposition.subject, map.concepts.findIndex((concept: any) => concept.id === proposition.subject));
              const b = pos(proposition.object, map.concepts.findIndex((concept: any) => concept.id === proposition.object));
              const edge = clippedEdge(proposition.subject, proposition.object);
              return <g key={proposition.id}><line className={`edge ${highlighted.includes(proposition.id) ? "edge-highlight" : ""}`} markerEnd="url(#arrow)" x1={edge.start.x} y1={edge.start.y} x2={edge.end.x} y2={edge.end.y} /><text className="edge-label" x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle">{relationLabel(proposition.relation, relationBank, proposition.as_written?.relation)}</text></g>;
            })}
          </svg>
          {!map.propositions.length && <div className="empty"><div className="empty-inner"><p>Your map is made by you. Add concepts and relations in the left pane, then assemble every arrow here.</p><a onClick={() => setHelp(true)}>Read the manual workflow in Help.</a></div></div>}
          {map.concepts.map((concept: any, index: number) => {
            const point = pos(concept.id, index);
            return <div
              ref={node => { nodeRefs.current[concept.id] = node; }}
              key={concept.id}
              role="button"
              tabIndex={0}
              aria-pressed={selected.includes(concept.id)}
              aria-label={`${concept.label}, ${String(concept.type || "novel").replace(/-/g, " ")}`}
              className={`node type-${concept.type || "novel"} ${selected.includes(concept.id) ? "selected" : ""}`}
              style={{ left: `${point.x / 8}%`, top: `${point.y / 6}%`, borderLeftColor: colors[concept.type] || "#6e7b7b" }}
              onPointerDown={event => {
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                const rect = (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                const viewX = (event.clientX - rect.left) * 800 / rect.width;
                const viewY = (event.clientY - rect.top) * 600 / rect.height;
                setDrag({ id: concept.id, dx: viewX - point.x, dy: viewY - point.y });
              }}
              onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.currentTarget.click();
                }
              }}
              onClick={event => {
                event.stopPropagation();
                if (selected.includes(concept.id)) setSelected(selected.filter(id => id !== concept.id));
                else if (selected.length === 1) {
                  setSelected([...selected, concept.id]);
                  setPicker({ x: point.x, y: point.y + 48 });
                } else setSelected([concept.id]);
              }}
            >{concept.label}<small>{String(concept.type || "novel").replace(/-/g, " ")}</small></div>;
          })}
          {picker && <div className="picker" role="dialog" aria-label="Choose a relation" style={{ left: `${picker.x / 8}%`, top: `${picker.y / 6}%` }} onClick={event => event.stopPropagation()}>
            <h4>Choose one of your relations</h4>
            {!relationBank.length && <div className="picker-empty">Add a relation in the left pane first.</div>}
            {relationBank.map(relation => <button key={relation.id} onClick={() => addRelation(relation)}>{relation.label}</button>)}
          </div>}
        </div>
      </section>
      <aside className="pane right-pane">
        <div className="panel"><div className="panel-title"><div><div className="eyebrow">03 / structure</div><h2>What shape is this?</h2></div><button className="work" onClick={() => toggle("structure")}>{showWork.structure ? "hide" : "show your work"}</button></div><div className="metric-grid"><div className="metric"><strong>{structure?.concepts ?? map.concepts.length}</strong><span>concepts</span></div><div className="metric"><strong>{structure?.propositions ?? map.propositions.length}</strong><span>propositions</span></div><div className="metric"><strong>{structure?.components ?? "—"}</strong><span>components</span></div><div className="metric"><strong>{structure?.density !== undefined ? Number(structure.density).toFixed(2) : "—"}</strong><span>density</span></div></div><p className="observation">Shape: <strong>{structure?.label || "tree"}</strong>. {structure?.orphans?.length ? `${structure.orphans.length} concepts are not connected yet.` : "Every concept is part of the conversation."}</p>{panelWork("structure", structure?.derivation)}</div>
        <div className="panel"><div className="panel-title"><div><div className="eyebrow">manual assembly</div><h2>You make every connection</h2></div></div><p className="observation">This workspace has no course pack, imported text path, inference accept button, or reference-map comparison. Only concepts placed on the canvas and relations you create can become part of this map.</p><div className="metric-grid"><div className="metric"><strong>{conceptBank.length}</strong><span>bank concepts</span></div><div className="metric"><strong>{relationBank.length}</strong><span>bank relations</span></div><div className="metric"><strong>{selected.length}</strong><span>selected nodes</span></div><div className="metric"><strong>{map.meta?.added_by?.drawn || 0}</strong><span>arrows added</span></div></div></div>
        <div className="panel"><div className="panel-title"><div><div className="eyebrow">saved locally</div><h2>Keep your map file</h2></div></div><p className="observation">Your map and your two banks are saved in this browser. Use <strong>Save map</strong> for a JSON copy and <strong>Export SVG</strong> for a picture.</p></div>
      </aside>
    </main>
    <footer className="footer">Built on the maker's knowledge principle. No AI, course pack, inference, or automatic map authoring.</footer>
    {help && <div className="overlay" onClick={() => setHelp(false)}><div className="modal" onClick={event => event.stopPropagation()}><div style={{ display: "flex", justifyContent: "space-between" }}><div className="eyebrow">COLLIGATE / field notes</div><button className="btn" style={{ color: "#435358", borderColor: "#c4cbc5" }} onClick={() => setHelp(false)}><X size={15} /></button></div><h1>Help</h1><div className="modal-tabs"><button className={helpTab === "students" ? "active" : ""} onClick={() => setHelpTab("students")}>For students</button><button className={helpTab === "instructors" ? "active" : ""} onClick={() => setHelpTab("instructors")}>For instructors</button></div><pre>{helpSection(helpTab === "students" ? "students" : "instructors")}</pre></div></div>}
  </div>;
}

createRoot(document.getElementById("root")!).render(<App />);