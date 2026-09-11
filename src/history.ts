export type EditableState = {
  map: any;
  conceptBank: any[];
  relationBank: any[];
};

export type HistoryEventKind = "edit" | "undo" | "redo";

export type HistoryEvent = {
  id: string;
  kind: HistoryEventKind;
  action: string;
  timestamp: string;
};

export type HistoryEntry = {
  snapshot: EditableState;
  action: HistoryEvent;
};

export type HistoryState = {
  past: HistoryEntry[];
  future: HistoryEntry[];
  timeline: HistoryEvent[];
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function sameEditableState(left: EditableState, right: EditableState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createHistoryState(timeline: HistoryEvent[] = []): HistoryState {
  return {
    past: [],
    future: [],
    timeline: clone(timeline),
  };
}

export function createHistoryEvent(
  kind: HistoryEventKind,
  action: string,
  timestamp = new Date().toISOString(),
  id = `${kind}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
): HistoryEvent {
  return { id, kind, action, timestamp };
}

export function recordHistoryEdit(
  history: HistoryState,
  previous: EditableState,
  next: EditableState,
  action: HistoryEvent,
): HistoryState {
  return {
    past: [...history.past, { snapshot: clone(previous), action: clone(action) }],
    future: [],
    timeline: [...history.timeline, clone(action)],
  };
}

export function undoHistory(
  history: HistoryState,
  current: EditableState,
  action: HistoryEvent,
): { state: EditableState; history: HistoryState } | null {
  const entry = history.past[history.past.length - 1];
  if (!entry) return null;
  return {
    state: clone(entry.snapshot),
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, { snapshot: clone(current), action: clone(entry.action) }],
      timeline: [...history.timeline, clone(action)],
    },
  };
}

export function redoHistory(
  history: HistoryState,
  current: EditableState,
  action: HistoryEvent,
): { state: EditableState; history: HistoryState } | null {
  const entry = history.future[history.future.length - 1];
  if (!entry) return null;
  return {
    state: clone(entry.snapshot),
    history: {
      past: [...history.past, { snapshot: clone(current), action: clone(entry.action) }],
      future: history.future.slice(0, -1),
      timeline: [...history.timeline, clone(action)],
    },
  };
}

function normalizeEvent(raw: any, index: number): HistoryEvent | null {
  if (!raw || typeof raw.action !== "string") return null;
  const kind: HistoryEventKind = raw.kind === "undo" || raw.kind === "redo" ? raw.kind : "edit";
  return {
    id: String(raw.id || `${kind}-${index + 1}`),
    kind,
    action: raw.action,
    timestamp: typeof raw.timestamp === "string" ? raw.timestamp : new Date().toISOString(),
  };
}

function normalizeEntry(raw: any, index: number): HistoryEntry | null {
  if (!raw?.snapshot || !raw.snapshot.map) return null;
  const action = normalizeEvent(raw.action, index);
  if (!action) return null;
  return {
    snapshot: {
      map: clone(raw.snapshot.map),
      conceptBank: Array.isArray(raw.snapshot.conceptBank) ? clone(raw.snapshot.conceptBank) : [],
      relationBank: Array.isArray(raw.snapshot.relationBank) ? clone(raw.snapshot.relationBank) : [],
    },
    action,
  };
}

export function normalizeHistory(raw: any): HistoryState {
  const timeline = Array.isArray(raw?.timeline)
    ? raw.timeline.map((event: any, index: number) => normalizeEvent(event, index)).filter(Boolean) as HistoryEvent[]
    : [];
  const past = Array.isArray(raw?.past)
    ? raw.past.map((entry: any, index: number) => normalizeEntry(entry, index)).filter(Boolean) as HistoryEntry[]
    : [];
  const future = Array.isArray(raw?.future)
    ? raw.future.map((entry: any, index: number) => normalizeEntry(entry, index)).filter(Boolean) as HistoryEntry[]
    : [];
  return { past, future, timeline };
}

export function createBackupDocument(
  map: any,
  conceptBank: any[],
  relationBank: any[],
  history: HistoryState,
): any {
  return {
    ...clone(map),
    concept_bank: clone(conceptBank),
    relation_bank: clone(relationBank),
    history: clone(history),
  };
}

export const exportMapWithHistory = createBackupDocument;