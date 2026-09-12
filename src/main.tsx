import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import barlowFontUrl from "./assets/BarlowCondensed-Regular.ttf?url";
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
import { deleteSelection } from "./deletion";
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
  const blob = new Blob([contents], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 2000);
}

async function plateFontCss(): Promise<string> {
  const fallback = `text{font-family:"Barlow Condensed",sans-serif;font-weight:400;letter-spacing:1px}`;
  try {
    const response = await fetch(barlowFontUrl, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return fallback;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return `@font-face{font-family:"Barlow Condensed";src:url(data:font/ttf;base64,${btoa(binary)}) format("truetype")}${fallback}`;
  } catch {
    return fallback;
  }
}

function printHtmlDocument(svg: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Colligate map</title><style>@page{size:landscape;margin:10mm}html,body{margin:0;background:#EDE4D2}svg{display:block;width:100%;height:100vh}</style></head><body>${svg}</body></html>`;
}

function printMarkup(html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  frame.srcdoc = html;
  document.body.appendChild(frame);
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      /* some preview frames block window.print */
    }
    window.setTimeout(() => frame.remove(), 2000);
  };
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

function Monogram() {
  return <svg className="monogram" viewBox="0 0 40 40" aria-hidden="true"><path fill="currentColor" fillRule="evenodd" d="M0 0h40v40H0z M3 3v34h34V3z M8 8h24v7H15v10h17v7H8z M19 18h16v4H19z" /></svg>;
}

function Corners() {
  return <>{[0, 1, 2, 3].map(corner => <span className="corner" key={corner}><Monogram /></span>)}</>;
}

function App() {
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [exportError, setExportError] = useState("");
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
  const [exportSheet, setExportSheet] = useState<null | { mode: "svg" | "print"; svg: string; fileUrl: string; printUrl: string }>(null);
  const [focusDraft, setFocusDraft] = useState(restored.map.focus_question || "");
  useEffect(() => {
    if (!help && !inspectorOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = document.querySelector(help ? ".modal" : ".proposition-pane");
    const controls = () => Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex="0"]') || []);
    controls()[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setHelp(false); setInspectorOpen(false); }
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); previous?.focus(); };
  }, [help, inspectorOpen]);
  const [helpTab, setHelpTab] = useState("students");
  const [showWork, setShowWork] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; start: { x: number; y: number }; moved: boolean } | null>(null);
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const [storageNotice, setStorageNotice] = useState(restored.restoredLegacy);
  const mapRef = useRef(map);
  const lastEditAt = useRef(Date.now());
  const previousEditCount = useRef(map.meta?.edit_count || 0);
  const focusEditingRef = useRef(false);
  const focusBeforeRef = useRef("");
  const focusDraftRef = useRef(restored.map.focus_question || "");
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
    // Mutations update the refs before scheduling React state. Read from the refs
    // here so an older render cannot overwrite a newer timer or pointer update.
    const current = editableRef.current;
    localStorage.setItem(MANUAL_MAP_STORAGE, JSON.stringify(current.map));
    localStorage.setItem(MANUAL_CONCEPT_BANK_STORAGE, JSON.stringify(current.conceptBank));
    localStorage.setItem(MANUAL_RELATION_BANK_STORAGE, JSON.stringify(current.relationBank));
    localStorage.setItem(MANUAL_HISTORY_STORAGE, JSON.stringify(historyRef.current));
    if (!focusEditingRef.current) {
      focusDraftRef.current = current.map.focus_question || "";
      setFocusDraft(focusDraftRef.current);
    }
    if ((current.map.meta?.edit_count || 0) !== previousEditCount.current) {
      previousEditCount.current = current.map.meta?.edit_count || 0;
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
    const added = commitEdit(
      `Connected "${conceptLabel(subject, editableRef.current.map)}" to "${conceptLabel(object, editableRef.current.map)}" with relation "${relation.label}"`,
      current => ({
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
      }),
    );
    if (added) {
      setSelected([]);
      setSelectedEdge(null);
      setPicker(null);
    }
  };

  const removeSelection = () => {
    if (!selected.length && !selectedEdge) return;
    const conceptIds = [...selected];
    const propositionId = selectedEdge;
    const currentMap = editableRef.current.map;
    const removedProposition = propositionId
      ? currentMap.propositions.find((proposition: any) => proposition.id === propositionId)
      : null;
    const action = conceptIds.length
      ? `Removed ${conceptIds.length === 1 ? "concept" : "concepts"} "${conceptIds.map(id => conceptLabel(id, currentMap)).join(", ")}"`
      : removedProposition
        ? `Removed connection "${propositionText(removedProposition, currentMap, relationBank)}"`
        : `Removed proposition "${propositionId}"`;
    const removed = commitEdit(action, current => deleteSelection(current, {
      conceptIds,
      propositionId,
    }));
    if (removed) {
      setSelected([]);
      setSelectedEdge(null);
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
    setSelectedEdge(null);
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
    setSelectedEdge(null);
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

  const closeExportSheet = () => {
    setExportSheet(current => {
      if (current) {
        URL.revokeObjectURL(current.fileUrl);
        URL.revokeObjectURL(current.printUrl);
      }
      return null;
    });
  };

  const buildPlateSvg = async () => {
    const fontStyle = await plateFontCss();
    const edges = map.propositions.map((proposition: any) => {
      const a = pos(proposition.subject, map.concepts.findIndex((concept: any) => concept.id === proposition.subject));
      const b = pos(proposition.object, map.concepts.findIndex((concept: any) => concept.id === proposition.object));
      const edge = clipLineToRectangles(a, b, SVG_NODE_RECT_SIZE, SVG_NODE_RECT_SIZE);
      return `<g><line x1="${edge.start.x}" y1="${edge.start.y}" x2="${edge.end.x}" y2="${edge.end.y}" stroke="#201C18" stroke-width="1" marker-end="url(#arrow)"/><text x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 6}" text-anchor="middle" font-size="10" fill="#5A5148" stroke="#EDE4D2" stroke-width="8" paint-order="stroke">${xmlEsc(relationLabel(proposition.relation, relationBank, proposition.as_written?.relation).toUpperCase())}</text></g>`;
    }).join("");
    const nodes = map.concepts.map((concept: any, index: number) => {
      const point = pos(concept.id, index);
      const label = xmlEsc(concept.label.toUpperCase());
      return `<g transform="translate(${point.x - 70} ${point.y - 22})"><rect width="140" height="44" fill="#EDE4D2" stroke="#201C18" stroke-width="1"/><text x="70" y="27" text-anchor="middle" font-size="15" fill="#201C18">${label}</text></g>`;
    }).join("");
    const marks = [[10,10],[830,10],[10,680],[830,680]].map(([x,y]) => `<g transform="translate(${x} ${y}) scale(.5)" fill="#C4441C"><path fill-rule="evenodd" d="M0 0h40v40H0z M3 3v34h34V3z M8 8h24v7H15v10h17v7H8z M19 18h16v4H19z"/></g>`).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 860 710" width="1200" height="990"><style>${fontStyle}</style><rect width="860" height="710" fill="#EDE4D2"/><rect x="11" y="11" width="838" height="688" fill="none" stroke="#C4441C" stroke-width="3"/><rect x="17" y="17" width="826" height="676" fill="none" stroke="#C4441C" stroke-width="1"/><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#201C18"/></marker></defs><g transform="translate(30 30)">${edges}${nodes}</g><path d="M40 642H820" stroke="#C4441C"/><text x="430" y="663" text-anchor="middle" font-size="14" fill="#201C18">${xmlEsc(map.title.toUpperCase())}</text><text x="430" y="683" text-anchor="middle" font-size="9" fill="#5A5148">COLLIGATE · CONCEPT MAPS · ${xmlEsc(new Date().toLocaleDateString())}</text>${marks}</svg>`;
  };

  const openExportSheet = (mode: "svg" | "print", svg: string) => {
    setExportSheet(current => {
      if (current) {
        URL.revokeObjectURL(current.fileUrl);
        URL.revokeObjectURL(current.printUrl);
      }
      return {
        mode,
        svg,
        fileUrl: URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" })),
        printUrl: URL.createObjectURL(new Blob([printHtmlDocument(svg)], { type: "text/html;charset=utf-8" })),
      };
    });
  };

  const exportSvg = async () => {
    setExportError("");
    try {
      const svg = await buildPlateSvg();
      download("colligate-map.svg", svg, "image/svg+xml");
      openExportSheet("svg", svg);
    } catch {
      setExportError("SVG export could not be built. Try again.");
    }
  };

  const printMap = async () => {
    setExportError("");
    try {
      const svg = await buildPlateSvg();
      printMarkup(printHtmlDocument(svg));
      try { window.print(); } catch { /* preview frames often block this */ }
      openExportSheet("print", svg);
    } catch {
      setExportError("The printable map could not be built. Try again.");
    }
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
    const moved = drag.moved || Math.abs(x - drag.start.x) > 2 || Math.abs(y - drag.start.y) > 2;
    if (!moved) return;
    if (!drag.moved) setDrag({ ...drag, moved: true });
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
    if (!drag.moved) {
      setDrag(null);
      return;
    }
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
  const updateFocusDraft = (focus_question: string) => {
    if (!focusEditingRef.current) {
      focusBeforeRef.current = editableRef.current.map.focus_question || "";
      focusEditingRef.current = true;
    }
    focusDraftRef.current = focus_question;
    setFocusDraft(focus_question);
  };
  const commitFocus = () => {
    if (!focusEditingRef.current) return;
    focusEditingRef.current = false;
    const current = editableRef.current;
    const previousFocus = focusBeforeRef.current;
    const draft = focusDraftRef.current;
    if (draft === previousFocus) return;
    const previous: EditableState = {
      ...current,
      map: { ...current.map, focus_question: previousFocus },
    };
    const next: EditableState = {
      ...current,
      map: {
        ...current.map,
        focus_question: draft,
        meta: { ...current.map.meta, edit_count: (current.map.meta?.edit_count || 0) + 1 },
      },
    };
    commitSnapshotEdit("Changed the focus question", previous, next);
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

  return <div className={`shell textured ${inspectorOpen ? "inspector-open" : ""}`} onClick={() => picker && setPicker(null)}>
    <header className="topbar">
      <div className="app-mark"><Monogram /></div>
      <div className="brand"><small>CONCEPT MAPS</small>COLLIGATE</div>
      <div className="edition">Concepts <small>&amp;</small> relations</div>
      <div className="focus"><label htmlFor="focus-question">Focus question</label><input id="focus-question" value={focusDraft} onChange={event => updateFocusDraft(event.target.value)} onBlur={commitFocus} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} /></div>
      <div className="toolbar">
        <button className="btn ghost" onClick={undo} disabled={!history.past.length} aria-label="Undo last action" title="Undo last action">Undo</button>
        <button className="btn ghost" onClick={redo} disabled={!history.future.length} aria-label="Redo last action" title="Redo last action">Redo</button>
        <button className="btn primary" onClick={save}>Save map</button>
        <button className="btn ghost" onClick={exportSvg}>Export SVG</button>
        <button className="btn" onClick={printMap}>Print / PDF</button>
        <button className="btn ghost" onClick={() => setHelp(true)}>Help</button>
        <a className="btn ghost" href="/">Collin Lucken</a>
      </div>
    </header>
    {exportError && <div className="storage-notice" role="alert">{exportError} <button className="btn" onClick={exportSvg}>Retry export</button></div>}
    <main className="workspace">
      <section className="pane proposition-pane">
        <button className="btn inspector-close" onClick={() => setInspectorOpen(false)}>Close inspector</button>
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
          {!map.propositions.length && <div className="proposition-empty">No propositions yet.</div>}
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
               <button className="btn small" type="submit">Add concept</button>
            </div>
          </form>
          <div className="bank bank-inline">
            <div className="bank-heading"><span className="eyebrow">Your concept bank · {conceptBank.length}</span><span className="subtle">Click or drag to place</span></div>
            <div><label className="subtle" htmlFor="concept-search">Search concepts</label><input id="concept-search" className="search" value={query} onChange={event => setQuery(event.target.value)} /></div>
            <div className="chips">
              {bank.map(concept => <button className="chip" draggable key={concept.id} onDragStart={event => event.dataTransfer.setData("application/x-weft-concept", concept.id)} onClick={() => addConcept(concept)} title="Click or drag onto canvas">{concept.label}</button>)}
              {!conceptBank.length && <span className="bank-empty">No concepts yet. Add your first one above.</span>}
              {!!conceptBank.length && !bank.length && <span className="bank-empty">No matching concepts.</span>}
            </div>
          </div>
          <form className="authoring-form" aria-label="Add relation" onSubmit={addRelationToBank}>
            <label htmlFor="relation-label">Add relation</label>
            <div className="form-row">
              <input id="relation-label" value={relationLabelInput} onChange={event => setRelationLabelInput(event.target.value)} placeholder="Relation label" />
              <button className="btn small" type="submit">Add relation</button>
            </div>
          </form>
          <div className="relation-bank"><span className="eyebrow">Your relation bank · {relationBank.length}</span><div className="chips">
            {relationBank.map(relation => <span className="chip relation-chip" key={relation.id}>{relation.label}</span>)}
            {!relationBank.length && <span className="bank-empty">No relations yet. Add one before connecting nodes.</span>}
          </div></div>
        </div>
      </section>
      <section className="pane canvas-pane">
        <div className="print-corners"><Corners /></div>
        <div className="canvas-tools"><div className="eyebrow">Conceptual space</div><button className="btn inspector-toggle" aria-expanded={inspectorOpen} onClick={() => setInspectorOpen(true)}>Add concept / relation</button><button className="btn" onClick={autoLayout}>Auto-layout</button><button className="btn" onClick={removeSelection} disabled={!selected.length && !selectedEdge}>Remove</button></div>
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
            setSelectedEdge(null);
            setPicker(null);
          }}
        >
          <svg ref={svgRef} viewBox="0 0 800 600" preserveAspectRatio="none">
            <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="var(--ink)" /></marker><marker id="arrow-selected" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="var(--vermillion)" /></marker></defs>
            {map.propositions.map((proposition: any) => {
              const a = pos(proposition.subject, map.concepts.findIndex((concept: any) => concept.id === proposition.subject));
              const b = pos(proposition.object, map.concepts.findIndex((concept: any) => concept.id === proposition.object));
              const edge = clippedEdge(proposition.subject, proposition.object);
              const edgeLabel = `${conceptLabel(proposition.subject, map)} ${relationLabel(proposition.relation, relationBank, proposition.as_written?.relation)} ${conceptLabel(proposition.object, map)} edge`;
              const selectEdge = () => {
                setSelected([]);
                setPicker(null);
                setSelectedEdge(proposition.id);
              };
              return <g key={proposition.id}><line className="edge-hit-target" aria-label={edgeLabel} role="button" tabIndex={0} aria-pressed={selectedEdge === proposition.id} x1={edge.start.x} y1={edge.start.y} x2={edge.end.x} y2={edge.end.y} onFocus={selectEdge} onClick={event => { event.stopPropagation(); selectEdge(); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectEdge(); } }} /><line className={`edge ${highlighted.includes(proposition.id) || selectedEdge === proposition.id ? "edge-highlight" : ""}`} markerEnd={selectedEdge === proposition.id ? "url(#arrow-selected)" : "url(#arrow)"} x1={edge.start.x} y1={edge.start.y} x2={edge.end.x} y2={edge.end.y} /><text className="edge-label" x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle">{relationLabel(proposition.relation, relationBank, proposition.as_written?.relation)}</text></g>;
            })}
          </svg>
          {!map.concepts.length && <div className="empty"><div className="empty-inner"><Corners /><p>CONCEPT MAPS</p><h1>Concepts<br /><small>and</small> relations</h1><Monogram /><p>Conceptual space</p></div></div>}
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
              style={{ left: `${point.x / 8}%`, top: `${point.y / 6}%` }}
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
                    moved: false,
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
                 setSelectedEdge(null);
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
            {!relationBank.length && <div className="picker-empty">No relations in your bank.</div>}
            {relationBank.map(relation => <button key={relation.id} onClick={() => addRelation(relation)}>{relation.label}</button>)}
          </div>}
        </div>
        <div className="print-caption"><Monogram /><span>{map.title} · COLLIGATE · CONCEPT MAPS · {new Date().toLocaleDateString()}</span><Monogram /></div>
      </section>
      <aside className="pane right-pane">
        <div className="panel"><div className="panel-title"><div><div className="eyebrow">03 / structure</div><h2>What shape is this?</h2></div><button className="work" onClick={() => toggle("structure")}>{showWork.structure ? "hide" : "show your work"}</button></div><div className="metric-grid"><div className="metric"><strong>{structure?.concepts ?? map.concepts.length}</strong><span>concepts</span></div><div className="metric"><strong>{structure?.propositions ?? map.propositions.length}</strong><span>propositions</span></div><div className="metric"><strong>{structure?.components ?? "—"}</strong><span>components</span></div><div className="metric"><strong>{structure?.density !== undefined ? Number(structure.density).toFixed(2) : "—"}</strong><span>density</span></div></div><p className="observation">Shape: <strong>{structure?.label || "tree"}</strong>. {structure?.orphans?.length ? `${structure.orphans.length} concepts are not connected yet.` : "Every concept is part of the conversation."}</p>{panelWork("structure", structure?.derivation)}</div>
          <div className="panel timeline-panel"><div className="panel-title"><h2>Map history</h2><span className="subtle">{history.timeline.length} actions</span></div><div className="timeline-list" aria-label="Map history timeline">{!history.timeline.length && <div className="timeline-empty">No actions yet.</div>}{history.timeline.slice().reverse().map(event => <div className={`timeline-entry timeline-${event.kind}`} key={event.id}><time dateTime={event.timestamp} title={displayTimestamp(event.timestamp)}>{displayTimestamp(event.timestamp)}</time><span>{event.action}</span></div>)}</div></div>
      </aside>
    </main>
    <footer className="footer">COLLIGATE · CONCEPT MAPS · Saved locally</footer>
    {help && <div className="overlay" onClick={() => setHelp(false)}><div className="modal" role="dialog" aria-modal="true" aria-label="Help" onKeyDown={event => { if (event.key === "Escape") setHelp(false); }} onClick={event => event.stopPropagation()}><Corners /><div style={{ display: "flex", justifyContent: "space-between" }}><div className="eyebrow">COLLIGATE / field notes</div><button autoFocus className="btn" onClick={() => setHelp(false)}>Close</button></div><h1>Help</h1><div className="modal-tabs"><button className={helpTab === "students" ? "active" : ""} onClick={() => setHelpTab("students")}>For students</button><button className={helpTab === "instructors" ? "active" : ""} onClick={() => setHelpTab("instructors")}>For instructors</button></div><pre>{helpSection(helpTab === "students" ? "students" : "instructors")}</pre></div></div>}
    {exportSheet && <div className="overlay" onClick={closeExportSheet}><div className="modal export-sheet" role="dialog" aria-modal="true" aria-label={exportSheet.mode === "print" ? "Print map" : "Export SVG"} onKeyDown={event => { if (event.key === "Escape") closeExportSheet(); }} onClick={event => event.stopPropagation()}><Corners /><div style={{ display: "flex", justifyContent: "space-between" }}><div className="eyebrow">{exportSheet.mode === "print" ? "COLLIGATE / print" : "COLLIGATE / export"}</div><button autoFocus className="btn" onClick={closeExportSheet}>Close</button></div><h1>{exportSheet.mode === "print" ? "Print / PDF" : "Export SVG"}</h1><p>{exportSheet.mode === "print" ? "If a print dialog does not appear, download the SVG or open the printable plate and choose Save as PDF." : "If the file did not download, use the button below."}</p><div className="export-actions"><a className="btn primary" href={exportSheet.fileUrl} download="colligate-map.svg">Download SVG</a><a className="btn" href={exportSheet.printUrl} target="_blank" rel="noopener">Open printable plate</a><button className="btn" onClick={() => { printMarkup(printHtmlDocument(exportSheet.svg)); try { window.print(); } catch { /* ignore */ } }}>Print</button></div><img className="plate" src={exportSheet.fileUrl} alt="Printable concept map" /></div></div>}
  </div>;
}

createRoot(document.getElementById("root")!).render(<App />);