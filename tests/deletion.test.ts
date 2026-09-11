import assert from "node:assert/strict";
import test from "node:test";
import { deleteSelection } from "../src/deletion.ts";
import {
  createHistoryEvent,
  createHistoryState,
  recordHistoryEdit,
  redoHistory,
  undoHistory,
  type EditableState,
} from "../src/history.ts";

const initial: EditableState = {
  map: {
    id: "map-1",
    concepts: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
      { id: "d", label: "D" },
    ],
    propositions: [
      { id: "ab", subject: "a", object: "b" },
      { id: "ba", subject: "b", object: "a" },
      { id: "cd", subject: "c", object: "d" },
    ],
    layout: {
      a: { x: 10, y: 10 },
      b: { x: 20, y: 20 },
      c: { x: 30, y: 30 },
      d: { x: 40, y: 40 },
    },
    meta: { edit_count: 4 },
  },
  conceptBank: [{ id: "a", label: "A" }],
  relationBank: [{ id: "rel", label: "connects" }],
};

test("deleting a concept removes its incident edges and layout but leaves the unaffected graph and banks", () => {
  const next = deleteSelection(initial, { conceptIds: ["a"] });

  assert.deepEqual(next.map.concepts.map((concept: any) => concept.id), ["b", "c", "d"]);
  assert.deepEqual(next.map.propositions.map((proposition: any) => proposition.id), ["cd"]);
  assert.deepEqual(next.map.layout, {
    b: { x: 20, y: 20 },
    c: { x: 30, y: 30 },
    d: { x: 40, y: 40 },
  });
  assert.deepEqual(next.conceptBank, initial.conceptBank);
  assert.deepEqual(next.relationBank, initial.relationBank);
  assert.equal(next.map.meta.edit_count, 5);
});

test("deleting an edge leaves both endpoint concepts and other edges intact", () => {
  const next = deleteSelection(initial, { propositionId: "ab" });

  assert.deepEqual(next.map.concepts, initial.map.concepts);
  assert.deepEqual(next.map.propositions.map((proposition: any) => proposition.id), ["ba", "cd"]);
  assert.deepEqual(next.map.layout, initial.map.layout);
  assert.deepEqual(next.conceptBank, initial.conceptBank);
  assert.deepEqual(next.relationBank, initial.relationBank);
});

test("deletion snapshots restore through undo and redo", () => {
  const deleted = deleteSelection(initial, { conceptIds: ["a"] });
  const edited = recordHistoryEdit(
    createHistoryState(),
    initial,
    deleted,
    createHistoryEvent("edit", "Removed concept \"A\"", "2025-01-01T00:00:00.000Z", "remove-1"),
  );
  const undone = undoHistory(
    edited,
    deleted,
    createHistoryEvent("undo", "Undo: Removed concept \"A\"", "2025-01-01T00:01:00.000Z", "undo-1"),
  )!;
  assert.deepEqual(undone.state, initial);

  const redone = redoHistory(
    undone.history,
    undone.state,
    createHistoryEvent("redo", "Redo: Removed concept \"A\"", "2025-01-01T00:02:00.000Z", "redo-1"),
  )!;
  assert.deepEqual(redone.state, deleted);
  assert.equal(redone.history.timeline.at(-1)?.kind, "redo");
});