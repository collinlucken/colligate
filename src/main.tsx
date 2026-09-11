import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Download, FileDown, HelpCircle, History as HistoryIcon, LayoutGrid, Plus, Redo2, Search, Undo2, X } from "lucide-react";
import helpText from "../data/HELP.md?raw";
import { diagnoseStructure } from "./engine";
import { clipLineToRectangles, SVG_NODE_RECT_SIZE, SVG_VIEWBOX, scaleSizeToViewBox, type Size } from "./geometry";
import {
  createBackupDocument,
  createHistoryEvent,
  createHistoryState,
  normalizeHistory,
  recordHistoryEdit,
  redoHistory,
  sameEditableState,
  undoHistory,
  type EditableState,
  type HistoryState,
} from "./history";
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
const MANUAL_HISTORY_STORAGE = "weft-manual-history";
const LEGACY_MAP_STORAGE = "weft-map";

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
      type: "concept",
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

function readStoredHistory(): HistoryState {
  try {
    const stored = localStorage.getItem(MANUAL_HISTORY_STORAGE);
    return stored ? normalizeHistory(JSON.parse(stored)) : createHistoryState();
  } catch {
    return createHistoryState();
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

function makeConcept(label: string, existing: ManualConcept[]): ManualConcept {
  return { id: uniqueId("concept", label, existing), label, type: "concept", pack_id: null };
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
      type: "concept",
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

function displayTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
}

function App() {
  const restored = useMemo(readStoredMap, []);
  const restoredConceptBank = useMemo(
    () => normalizeConceptBank(readStoredBank(MANUAL_CONCEPT_BANK_STORAGE, [])),
    [],
  );
  const restoredRelationBank = useMemo(
    () => normalizeRelationBank(readStoredBank(MANUAL_RELATION_BANK_STORAGE, [])),
    [],
  );
  const [map, setMap] = useState<AnyMap>(restored.map);
  const [conceptBank, setConceptBank] = useState<ManualConcept[]>(restoredConceptBank);
  const [relationBank, setRelationBank] = useState<ManualRelation[]>(restoredRelationBank);
  const [history, setHistory] = useState<HistoryState>(() => readStoredHistory());
  const [conceptLabelInput, setConceptLabelInput] = useState("");
  const [relationLabelInput, setRelationLabelInput] = useState("");
  const [query, setQuery] = useState("");
  const [help, setHelp] = useState(false);
  const [helpTab, setHelpTab] = useState("students");
  const [showWork, setShowWork] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; start: { x: number; y: number } } | null>(null);
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const [storageNotice, setStorageNotice] = useState(restored.restoredLegacy);
  const mapRef = useRef(map);
  const lastEditAt = useRef(Date.now());
  const previousEditCount = useRef(map.meta?.edit_count || 0);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [nodeSizes, setNodeSizes] = useState<Record<string, Size>>({});
  const editableRef = useRef<EditableState>({
    map: restored.map,
    conceptBank: restoredConceptBank,
    relationBank: restoredRelationBank,
  });
  const historyRef = useRef(history);
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
    editableRef.current = { map, conceptBank, relationBank };
    historyRef.current = history;
    localStorage.setItem(MANUAL_MAP_STORAGE, JSON.stringify(map));
    localStorage.setItem(MANUAL_CONCEPT_BANK_STORAGE, JSON.stringify(conceptBank));
    localStorage.setItem(MANUAL_RELATION_BANK_STORAGE, JSON.stringify(relationBank));
    localStorage.setItem(MANUAL_HISTORY_STORAGE, JSON.stringify(history));
    if ((map.meta?.edit_count || 0) !== previousEditCount.current) {
      previousEditCount.current = map.meta?.edit_count || 0;
      lastEditAt.current = Date.now();
    }
  }, [map, conceptBank, relationBank, history]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastEditAt.current < 300000) {
        const current = editableRef.current;
        const nextMap = {
          ...current.map,
          meta: { ...current.map.meta, session_seconds: (current.map.meta?.session_seconds || 0) + 1 },
        };
        editableRef.current = { ...current, map: nextMap };
        mapRef.current = nextMap;
        setMap(nextMap);
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

  const applyEditableState = (next: EditableState) => {
    editableRef.current = next;
    mapRef.current = next.map;
    setMap(next.map);
    setConceptBank(next.conceptBank);
    setRelationBank(next.relationBank);
  };

  const commitSnapshotEdit = (action: string, previous: EditableState, next: EditableState): boolean => {
    if (sameEditableState(previous, next)) return false;
    const event = createHistoryEvent("edit", action);
    const nextHistory = recordHistoryEdit(historyRef.current, previous, next, event);
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    applyEditableState(next);
    lastEditAt.current = Date.now();
    return true;
  };

  const commitEdit = (
    action: string,
    update: (current: EditableState) => EditableState,
  ): boolean => {
    const current = editableRef.current;
    const next = update(current);
    return commitSnapshotEdit(action, current, next);
  };

  const addConcept = (concept: ManualConcept, at?: { x: number; y: number }) => {
    if (editableRef.current.map.concepts.some((item: any) => item.id === concept.id)) return;
    commitEdit(`Placed concept "${concept.label}"`, current => ({
      ...current,
      map: {
        ...current.map,
        concepts: [...current.map.concepts, concept],
        layout: {
          ...current.map.layout,
          [concept.id]: at || {
            x: 180 + (current.map.concepts.length % 4) * 150,
            y: 130 + Math.floor(current.map.concepts.length / 4) * 90,
          },
        },
        meta: { ...current.map.meta, edit_count: (current.map.meta?.edit_count || 0) + 1 },
      },
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
    const added = commitEdit(`Connected concepts with "${relation.label}"`, current => ({
      ...current,
      map: {
        ...current.map,
        propositions: [...current.map.propositions, proposition],
        meta: {
          ...current.map.meta,
          edit_count: (current.map.meta?.edit_count || 0) + 1,
          added_by: { ...current.map.meta.added_by, drawn: (current.map.meta?.added_by?.drawn || 0) + 1 },
        },
      },
    }));
    if (added) {
      setSelected([]);
      setPicker(null);
    }
  };

  const addConceptToBank = (event: React.FormEvent) => {
    event.preventDefault();
    const label = conceptLabelInput.trim();
    if (!label) return;
    if (conceptBank.some(concept => concept.label.toLowerCase() === label.toLowerCase())) {
      setConceptLabelInput("");
      return;
    }
    commitEdit(`Added concept "${label}" to the bank`, current => ({
      ...current,
      conceptBank: [...current.conceptBank, makeConcept(label, current.conceptBank)],
    }));
    setConceptLabelInput("");
  };

  const addRelationToBank = (event: React.FormEvent) => {
    event.preventDefault();
    const label = relationLabelInput.trim();
    if (!label) return;
    if (relationBank.some(relation => relation.label.toLowerCase() === label.toLowerCase())) {
      setRelationLabelInput("");
      return;
    }
    commitEdit(`Added relation "${label}" to the bank`, current => ({
      ...current,
      relationBank: [...current.relationBank, makeRelation(label, current.relationBank)],
    }));
    setRelationLabelInput("");
  };

  const autoLayout = () => {
    const currentMap = editableRef.current.map;
    const columns = Math.max(1, Math.ceil(Math.sqrt(currentMap.concepts.length)));
    const layout: Record<string, { x: number; y: number }> = {};
    currentMap.concepts.forEach((concept: any, index: number) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      layout[concept.id] = {
        x: 80 + (column * 640) / Math.max(columns, 1),
        y: 75 + row * 105,
      };
    });
    commitEdit("Rearranged the canvas", current => ({
      ...current,
      map: {
        ...current.map,
        layout,
        meta: { ...current.map.meta, edit_count: (current.map.meta?.edit_count || 0) + 1 },
      },
    }));
  };

  const save = () => download(
    `${(map.title || "colligate-map").replace(/\s+/g, "-")}.map.json`,
    JSON.stringify(createBackupDocument(map, conceptBank, relationBank, history), null, 2),
  );

  const undo = () => {
    const currentHistory = historyRef.current;
    const entry = currentHistory.past[currentHistory.past.length - 1];
    if (!entry) return;
    const event = createHistoryEvent("undo", `Undo: ${entry.action.action}`);
    const result = undoHistory(currentHistory, editableRef.current, event);
    if (!result) return;
    historyRef.current = result.history;
    setHistory(result.history);
    applyEditableState(result.state);
    setSelected([]);
    setPicker(null);
    lastEditAt.current = Date.now();
  };

  const redo = () => {
    const currentHistory = historyRef.current;
    const entry = currentHistory.future[currentHistory.future.length - 1];
    if (!entry) return;
    const event = createHistoryEvent("redo", `Redo: ${entry.action.action}`);
    const result = redoHistory(currentHistory, editableRef.current, event);
    if (!result) return;
    historyRef.current = result.history;
    setHistory(result.history);
    applyEditableState(result.state);
    setSelected([]);
    setPicker(null);
    lastEditAt.current = Date.now();
  };

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName || "")) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [history]);

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
      return `<g transform="translate(${point.x - 70} ${point.y - 22})"><rect width="140" height="44" rx="5" fill="#fffdf8" stroke="#6e7b7b" stroke-width="2"/><text x="70" y="26" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="600" fill="#243b3c">${label}</text></g>`;
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
    const current = editableRef.current;
    const nextMap = {
      ...current.map,
      layout: {
        ...current.map.layout,
        [drag.id]: { x: Math.max(20, Math.min(780, x)), y: Math.max(20, Math.min(580, y)) },
      },
    };
    editableRef.current = { ...current, map: nextMap };
    mapRef.current = nextMap;
    setMap(nextMap);
  };
  const finishDrag = () => {
    if (!drag) return;
    const current = editableRef.current;
    const movedTo = current.map.layout?.[drag.id];
    const movedFrom = drag.start;
    const changed = movedTo && (movedTo.x !== movedFrom.x || movedTo.y !== movedFrom.y);
    if (changed) {
      const previous: EditableState = {
        ...current,
        map: {
          ...current.map,
          layout: { ...current.map.layout, [drag.id]: movedFrom },
        },
      };
      const next: EditableState = {
        ...current,
        map: {
          ...current.map,
          meta: { ...current.map.meta, edit_count: (current.map.meta?.edit_count || 0) + 1 },
        },
      };
      commitSnapshotEdit(`Moved node "${conceptLabel(drag.id, current.map)}"`, previous, next);
    }
    setDrag(null);
  };
  const updateFocus = (focus_question: string) => {
    commitEdit("Changed the focus question", current => ({
      ...current,
      map: {
        ...current.map,
        focus_question,
        meta: { ...current.map.meta, edit_count: (current.map.meta?.edit_count || 0) + 1 },
      },
    }));
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
      <div className="brand">COLLIGATE <small>CONCEPT MAPS</small></div>
      <div className="focus"><label>Focus question</label><input value={map.focus_question || ""} onChange={event => updateFocus(event.target.value)} /></div>
      <div className="toolbar">
        <button className="btn ghost" onClick={undo} disabled={!history.past.length} aria-label="Undo last action" title="Undo last action"><Undo2 size={14} />Undo</button>
        <button className="btn ghost" onClick={redo} disabled={!history.future.length} aria-label="Redo last action" title="Redo last action"><Redo2 size={14} />Redo</button>
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
        <div className="canvas-tools"><div><div className="eyebrow">02 / conceptual space</div></div><button className="btn" style={{ color: "#435358", borderColor: "#c4cbc5" }} onClick={autoLayout}><LayoutGrid size={14} />Auto-layout</button></div>
        <div
          ref={canvasRef}
          className="canvas"
          onPointerMove={onPointerMove}
          onPointerUp={finishDrag}
           onPointerCancel={finishDrag}
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
              aria-label={concept.label}
              className={`node ${selected.includes(concept.id) ? "selected" : ""}`}
              style={{ left: `${point.x / 8}%`, top: `${point.y / 6}%`, borderLeftColor: "#6e7b7b" }}
              onPointerDown={event => {
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                const rect = (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                const viewX = (event.clientX - rect.left) * 800 / rect.width;
                const viewY = (event.clientY - rect.top) * 600 / rect.height;
                 setDrag({
                   id: concept.id,
                   dx: viewX - point.x,
                   dy: viewY - point.y,
                   start: { x: point.x, y: point.y },
                 });
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
            >{concept.label}</div>;
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
         <div className="panel timeline-panel"><div className="panel-title"><div><div className="eyebrow"><HistoryIcon size={12} /> timeline</div><h2>Map history</h2></div><span className="subtle">{history.timeline.length} actions</span></div><div className="timeline-list" aria-label="Map history timeline">{!history.timeline.length && <div className="timeline-empty">No actions yet.</div>}{history.timeline.map(event => <div className={`timeline-entry timeline-${event.kind}`} key={event.id}><time dateTime={event.timestamp}>{displayTimestamp(event.timestamp)}</time><span>{event.action}</span></div>)}</div></div>
        <div className="panel"><div className="panel-title"><div><div className="eyebrow">saved locally</div><h2>Keep your map file</h2></div></div><p className="observation">Your map and your two banks are saved in this browser. Use <strong>Save map</strong> for a JSON copy and <strong>Export SVG</strong> for a picture.</p></div>
      </aside>
    </main>
    <footer className="footer">Built on the maker's knowledge principle. No AI, course pack, inference, or automatic map authoring.</footer>
    {help && <div className="overlay" onClick={() => setHelp(false)}><div className="modal" onClick={event => event.stopPropagation()}><div style={{ display: "flex", justifyContent: "space-between" }}><div className="eyebrow">COLLIGATE / field notes</div><button className="btn" style={{ color: "#435358", borderColor: "#c4cbc5" }} onClick={() => setHelp(false)}><X size={15} /></button></div><h1>Help</h1><div className="modal-tabs"><button className={helpTab === "students" ? "active" : ""} onClick={() => setHelpTab("students")}>For students</button><button className={helpTab === "instructors" ? "active" : ""} onClick={() => setHelpTab("instructors")}>For instructors</button></div><pre>{helpSection(helpTab === "students" ? "students" : "instructors")}</pre></div></div>}
  </div>;
}

createRoot(document.getElementById("root")!).render(<App />);