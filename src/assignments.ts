export type AssignmentRequirements = {
  minConcepts?: number;
  maxConcepts?: number;
  minPropositions?: number;
  minUniqueRelations?: number;
  minDegree?: number;
  requireConnected?: boolean;
  requiredConcepts?: string[];
  requiredRelations?: string[];
  timeLimitMinutes?: number;
};

export type Assignment = {
  code: string;
  title?: string;
  focus_question: string;
  requirements: AssignmentRequirements;
};

export type RequirementCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type AssignmentReport = {
  assignment: Assignment;
  passed: boolean;
  checks: RequirementCheck[];
};

const TICKET_PREFIX = "CG:";

export const normLabel = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

export function normalizeCode(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

function positiveInt(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value.split(/[,;]+/).map(item => item.trim()).filter(Boolean);
  }
  return [];
}

export function normalizeAssignment(raw: any): Assignment | null {
  if (!raw || typeof raw !== "object") return null;
  const requirements = raw.requirements && typeof raw.requirements === "object" ? raw.requirements : {};
  const code = String(raw.code || "").trim();
  const focus_question = String(raw.focus_question || "").trim();
  if (!code || !focus_question) return null;
  const requiredConcepts = stringList(requirements.requiredConcepts);
  const requiredRelations = stringList(requirements.requiredRelations);
  return {
    code,
    title: String(raw.title || "").trim() || undefined,
    focus_question,
    requirements: {
      minConcepts: positiveInt(requirements.minConcepts),
      maxConcepts: positiveInt(requirements.maxConcepts),
      minPropositions: positiveInt(requirements.minPropositions),
      minUniqueRelations: positiveInt(requirements.minUniqueRelations),
      minDegree: positiveInt(requirements.minDegree),
      requireConnected: Boolean(requirements.requireConnected),
      requiredConcepts: requiredConcepts.length ? requiredConcepts : undefined,
      requiredRelations: requiredRelations.length ? requiredRelations : undefined,
      timeLimitMinutes: positiveInt(requirements.timeLimitMinutes),
    },
  };
}

export function mergeCatalog(base: Assignment[], extra: Assignment[]): Assignment[] {
  const byCode = new Map<string, Assignment>();
  for (const assignment of [...base, ...extra]) {
    const normalized = normalizeAssignment(assignment);
    if (normalized) byCode.set(normalizeCode(normalized.code), normalized);
  }
  return [...byCode.values()];
}

function relationName(proposition: { relation?: any; as_written?: { relation?: string } }): string {
  const relation = proposition.relation;
  if (typeof relation === "object" && relation) return String(relation.free || relation.label || "");
  return String(proposition.as_written?.relation || relation || "");
}

function uniqueLabels(labels: string[]): { count: number; duplicates: string[] } {
  const first = new Map<string, string>();
  const duplicates = new Set<string>();
  for (const label of labels) {
    const key = normLabel(label);
    if (!key) continue;
    if (first.has(key)) duplicates.add(first.get(key)!);
    else first.set(key, label.trim());
  }
  return { count: first.size, duplicates: [...duplicates] };
}

function countDetail(unique: number, total: number, unit: string): string {
  return unique === total ? `have ${unique}` : `have ${unique} unique (${total} ${unit})`;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function graphOf(map: { concepts: { id: string; label: string }[]; propositions: { subject: string; object: string }[] }) {
  const ids = map.concepts.map(concept => concept.id);
  const labels = new Map(map.concepts.map(concept => [concept.id, concept.label]));
  const degree = new Map(ids.map(id => [id, 0]));
  const adj = new Map(ids.map(id => [id, new Set<string>()]));
  for (const proposition of map.propositions) {
    if (!degree.has(proposition.subject) || !degree.has(proposition.object)) continue;
    degree.set(proposition.subject, (degree.get(proposition.subject) || 0) + 1);
    degree.set(proposition.object, (degree.get(proposition.object) || 0) + 1);
    adj.get(proposition.subject)?.add(proposition.object);
    adj.get(proposition.object)?.add(proposition.subject);
  }
  let components = 0;
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    components += 1;
    const queue = [id];
    seen.add(id);
    while (queue.length) {
      const current = queue.shift()!;
      for (const next of adj.get(current) || []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
  }
  const orphans = ids.filter(id => (degree.get(id) || 0) === 0).map(id => labels.get(id) || id);
  return { degree, components, orphans, labels };
}

export function evaluateAssignment(
  assignment: Assignment,
  map: {
    concepts: { id: string; label: string }[];
    propositions: { subject: string; object: string; relation?: any; as_written?: { relation?: string } }[];
  },
  clock?: { startedAt?: number; now?: number },
): AssignmentReport {
  const { requirements } = assignment;
  const graph = graphOf(map);
  const conceptCount = map.concepts.length;
  const propositionCount = map.propositions.length;
  const uniqueConcepts = uniqueLabels(map.concepts.map(concept => concept.label));
  const uniqueRelations = uniqueLabels(map.propositions.map(proposition => relationName(proposition)));
  const checks: RequirementCheck[] = [];

  if (requirements.minConcepts) {
    checks.push({
      id: "minConcepts",
      label: `At least ${requirements.minConcepts} unique concepts`,
      ok: uniqueConcepts.count >= requirements.minConcepts,
      detail: countDetail(uniqueConcepts.count, conceptCount, "nodes"),
    });
  }
  if (requirements.maxConcepts) {
    checks.push({
      id: "maxConcepts",
      label: `At most ${requirements.maxConcepts} unique concepts`,
      ok: uniqueConcepts.count <= requirements.maxConcepts,
      detail: countDetail(uniqueConcepts.count, conceptCount, "nodes"),
    });
  }
  if (requirements.minPropositions) {
    checks.push({
      id: "minPropositions",
      label: `At least ${requirements.minPropositions} connections`,
      ok: propositionCount >= requirements.minPropositions,
      detail: `have ${propositionCount}`,
    });
  }
  if (requirements.minUniqueRelations) {
    checks.push({
      id: "minUniqueRelations",
      label: `At least ${requirements.minUniqueRelations} unique relations`,
      ok: uniqueRelations.count >= requirements.minUniqueRelations,
      detail: countDetail(uniqueRelations.count, propositionCount, "connections"),
    });
  }
  if (requirements.minDegree) {
    const weak = map.concepts
      .filter(concept => (graph.degree.get(concept.id) || 0) < requirements.minDegree!)
      .map(concept => concept.label);
    checks.push({
      id: "minDegree",
      label: `Each concept has at least ${requirements.minDegree} connection${requirements.minDegree === 1 ? "" : "s"}`,
      ok: conceptCount > 0 && weak.length === 0,
      detail: conceptCount === 0 ? "no concepts yet" : weak.length ? `below: ${weak.join(", ")}` : "all met",
    });
  }
  if (requirements.requireConnected) {
    const connected = conceptCount === 0 ? false : graph.components <= 1 && graph.orphans.length === 0;
    checks.push({
      id: "requireConnected",
      label: "Every concept is connected",
      ok: connected,
      detail: conceptCount === 0 ? "no concepts yet" : graph.orphans.length ? `isolated: ${graph.orphans.join(", ")}` : `${graph.components} component${graph.components === 1 ? "" : "s"}`,
    });
  }
  if (requirements.requiredConcepts?.length) {
    const have = new Set(map.concepts.map(concept => normLabel(concept.label)));
    const missing = requirements.requiredConcepts.filter(label => !have.has(normLabel(label)));
    checks.push({
      id: "requiredConcepts",
      label: `Must use: ${requirements.requiredConcepts.join(", ")}`,
      ok: missing.length === 0,
      detail: missing.length ? `missing ${missing.join(", ")}` : "all present",
    });
  }
  if (requirements.requiredRelations?.length) {
    const have = new Set(map.propositions.map(proposition => normLabel(relationName(proposition))));
    const missing = requirements.requiredRelations.filter(label => !have.has(normLabel(label)));
    checks.push({
      id: "requiredRelations",
      label: `Must use relation: ${requirements.requiredRelations.join(", ")}`,
      ok: missing.length === 0,
      detail: missing.length ? `missing ${missing.join(", ")}` : "all present",
    });
  }
  if (requirements.timeLimitMinutes) {
    const now = clock?.now ?? Date.now();
    const startedAt = clock?.startedAt ?? now;
    const elapsed = Math.max(0, now - startedAt);
    const limit = requirements.timeLimitMinutes * 60_000;
    const within = elapsed <= limit;
    checks.push({
      id: "timeLimit",
      label: `Finished within ${requirements.timeLimitMinutes} min`,
      ok: within,
      detail: within ? `${formatClock(limit - elapsed)} remaining` : `${formatClock(elapsed - limit)} over`,
    });
  }

  return { assignment, passed: checks.every(check => check.ok), checks };
}

export function encodeTicket(assignment: Assignment): string {
  const normalized = normalizeAssignment(assignment);
  if (!normalized) return "";
  const r = normalized.requirements;
  const parts = [normalized.code.replace(/\|/g, ""), normalized.focus_question.replace(/\|/g, "/")];
  if (r.minConcepts) parts.push(`c${r.minConcepts}`);
  if (r.maxConcepts) parts.push(`x${r.maxConcepts}`);
  if (r.minPropositions) parts.push(`p${r.minPropositions}`);
  if (r.minUniqueRelations) parts.push(`u${r.minUniqueRelations}`);
  if (r.minDegree) parts.push(`d${r.minDegree}`);
  if (r.timeLimitMinutes) parts.push(`t${r.timeLimitMinutes}`);
  if (r.requireConnected) parts.push("n");
  if (r.requiredConcepts?.length) parts.push(`m:${r.requiredConcepts.join(",")}`);
  if (r.requiredRelations?.length) parts.push(`r:${r.requiredRelations.join(",")}`);
  return TICKET_PREFIX + parts.join("|");
}

export function decodeTicket(raw: string): Assignment | null {
  const text = raw.trim();
  if (!text.toUpperCase().startsWith(TICKET_PREFIX)) return null;
  const body = text.slice(TICKET_PREFIX.length);
  const [code, question, ...flags] = body.split("|");
  if (!code?.trim() || !question?.trim()) return null;
  const requirements: AssignmentRequirements = {};
  for (const flag of flags) {
    const token = flag.trim();
    if (!token) continue;
    if (token === "n" || token === "N") requirements.requireConnected = true;
    else if (/^c\d+$/i.test(token)) requirements.minConcepts = Number(token.slice(1));
    else if (/^x\d+$/i.test(token)) requirements.maxConcepts = Number(token.slice(1));
    else if (/^p\d+$/i.test(token)) requirements.minPropositions = Number(token.slice(1));
    else if (/^u\d+$/i.test(token)) requirements.minUniqueRelations = Number(token.slice(1));
    else if (/^d\d+$/i.test(token)) requirements.minDegree = Number(token.slice(1));
    else if (/^t\d+$/i.test(token)) requirements.timeLimitMinutes = Number(token.slice(1));
    else if (/^m:/i.test(token)) requirements.requiredConcepts = stringList(token.slice(2));
    else if (/^r:/i.test(token)) requirements.requiredRelations = stringList(token.slice(2));
  }
  return normalizeAssignment({ code: code.trim(), focus_question: question.trim(), requirements });
}

export function lookupAssignment(raw: string, catalog: Assignment[]): Assignment | null {
  const text = raw.trim();
  if (!text) return null;
  if (text.startsWith("{")) {
    try { return normalizeAssignment(JSON.parse(text)); } catch { return null; }
  }
  const ticket = decodeTicket(text);
  if (ticket) return ticket;
  const code = normalizeCode(text);
  return catalog.find(assignment => normalizeCode(assignment.code) === code) || null;
}

export function failedSummary(report: AssignmentReport): string {
  return report.checks.filter(check => !check.ok).map(check => `${check.label} (${check.detail})`).join("; ");
}
