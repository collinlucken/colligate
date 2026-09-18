import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeTicket,
  encodeTicket,
  evaluateAssignment,
  lookupAssignment,
  mergeCatalog,
  normalizeAssignment,
  type Assignment,
} from "../src/assignments.ts";

const mind1: Assignment = {
  code: "MIND1",
  title: "Mind and body",
  focus_question: "How is the mind related to the body?",
  requirements: {
    minConcepts: 6,
    minPropositions: 5,
    minDegree: 1,
    requireConnected: true,
    requiredConcepts: ["mind", "body"],
  },
};

const emptyMap = { concepts: [], propositions: [] };

test("empty maps fail every quantitative requirement", () => {
  const report = evaluateAssignment(mind1, emptyMap);
  assert.equal(report.passed, false);
  assert.deepEqual(report.checks.map(check => check.id), [
    "minConcepts", "minPropositions", "minDegree", "requireConnected", "requiredConcepts",
  ]);
  assert.ok(report.checks.every(check => !check.ok));
});

test("a complete connected map with required labels passes", () => {
  const map = {
    concepts: [
      { id: "a", label: "Mind" },
      { id: "b", label: "Body" },
      { id: "c", label: "Brain" },
      { id: "d", label: "Thought" },
      { id: "e", label: "Action" },
      { id: "f", label: "World" },
    ],
    propositions: [
      { subject: "a", object: "b", relation: { free: "is related to" } },
      { subject: "a", object: "c", relation: { free: "depends on" } },
      { subject: "c", object: "d", relation: { free: "produces" } },
      { subject: "d", object: "e", relation: { free: "guides" } },
      { subject: "e", object: "f", relation: { free: "changes" } },
    ],
  };
  const report = evaluateAssignment(mind1, map);
  assert.equal(report.passed, true);
});

test("required concepts match case-insensitively and report missing labels", () => {
  const map = {
    concepts: [
      { id: "a", label: "MIND" },
      { id: "b", label: "brain" },
    ],
    propositions: [{ subject: "a", object: "b", relation: { free: "uses" } }],
  };
  const report = evaluateAssignment(mind1, map);
  const required = report.checks.find(check => check.id === "requiredConcepts");
  assert.equal(required?.ok, false);
  assert.match(required?.detail || "", /body/i);
});

test("minDegree fails isolated or under-connected concepts", () => {
  const assignment = normalizeAssignment({
    code: "DEG",
    focus_question: "Q",
    requirements: { minDegree: 2 },
  })!;
  const map = {
    concepts: [
      { id: "a", label: "Mind" },
      { id: "b", label: "Body" },
      { id: "c", label: "Soul" },
    ],
    propositions: [
      { subject: "a", object: "b", relation: { free: "pairs with" } },
      { subject: "a", object: "c", relation: { free: "contrasts with" } },
    ],
  };
  const report = evaluateAssignment(assignment, map);
  const degree = report.checks.find(check => check.id === "minDegree");
  assert.equal(degree?.ok, false);
  assert.match(degree?.detail || "", /Body/);
  assert.match(degree?.detail || "", /Soul/);
});

test("required relations look at used arrow labels", () => {
  const assignment = normalizeAssignment({
    code: "REL",
    focus_question: "Q",
    requirements: { requiredRelations: ["is part of"] },
  })!;
  const missing = evaluateAssignment(assignment, {
    concepts: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    propositions: [{ subject: "a", object: "b", relation: { free: "causes" } }],
  });
  assert.equal(missing.passed, false);
  const present = evaluateAssignment(assignment, {
    concepts: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    propositions: [{ subject: "a", object: "b", relation: { free: "is part of" } }],
  });
  assert.equal(present.passed, true);
});

test("tickets round-trip through the chalkboard encoding", () => {
  const ticket = encodeTicket(mind1);
  assert.match(ticket, /^CG:MIND1\|/);
  const decoded = decodeTicket(ticket);
  assert.equal(decoded?.code, "MIND1");
  assert.equal(decoded?.focus_question, mind1.focus_question);
  assert.deepEqual(decoded?.requirements.minConcepts, 6);
  assert.deepEqual(decoded?.requirements.requiredConcepts, ["mind", "body"]);
  assert.equal(decoded?.requirements.requireConnected, true);
});

test("lookup accepts catalog codes, tickets, and JSON", () => {
  const catalog = mergeCatalog([mind1], []);
  assert.equal(lookupAssignment(" mind1 ", catalog)?.code, "MIND1");
  assert.equal(lookupAssignment(encodeTicket(mind1), catalog)?.focus_question, mind1.focus_question);
  const fromJson = lookupAssignment(JSON.stringify(mind1), []);
  assert.equal(fromJson?.requirements.minPropositions, 5);
  assert.equal(lookupAssignment("NOPE", catalog), null);
});
