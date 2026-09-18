export type AssignmentRequirements = {
  minConcepts?: number;
  maxConcepts?: number;
  minPropositions?: number;
  minDegree?: number;
  requireConnected?: boolean;
  requiredConcepts?: string[];
  requiredRelations?: string[];
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
      minDegree: positiveInt(requirements.minDegree),
      requireConnected: Boolean(requirements.requireConnected),
      requiredConcepts: requiredConcepts.length ? requiredConcepts : undefined,
      requiredRelations: requiredRelations.length ? requiredRelations : undefined,
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
): AssignmentReport {
  const { requirements } = assignment;
  const graph = graphOf(map);
  const conceptCount = map.concepts.length;
  const propositionCount = map.propositions.length;
  const checks: RequirementCheck[] = [];

  if (requirements.minConcepts) {
    checks.push({
      id: "minConcepts",
      label: `At least ${requirements.minConcepts} concepts`,
      ok: conceptCount >= requirements.minConcepts,
      detail: `have ${conceptCount}`,
    });
  }
  if (requirements.maxConcepts) {
    checks.push({
      id: "maxConcepts",
      label: `At most ${requirements.maxConcepts} concepts`,
      ok: conceptCount <= requirements.maxConcepts,
      detail: `have ${conceptCount}`,
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
  if (r.minDegree) parts.push(`d${r.minDegree}`);
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
    else if (/^d\d+$/i.test(token)) requirements.minDegree = Number(token.slice(1));
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
