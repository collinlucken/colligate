import assert from "node:assert/strict";
import test from "node:test";
import {
  createBackupDocument,
  createHistoryEvent,
  createHistoryState,
  recordHistoryEdit,
  redoHistory,
  undoHistory,
  type EditableState,
} from "../src/history.ts";

const initial: EditableState = {
  map: { id: "map-1", concepts: [], propositions: [], layout: {} },
  conceptBank: [],
  relationBank: [],
};

test("history restores edits through undo and redo while retaining timeline evidence", () => {
  const added = {
    ...initial,
    map: { ...initial.map, concepts: [{ id: "concept-a", label: "A" }] },
    conceptBank: [{ id: "concept-a", label: "A" }],
  };
  const edit = createHistoryEvent("edit", "Placed concept \"A\"", "2025-01-01T00:00:00.000Z", "edit-1");
  const afterEdit = recordHistoryEdit(createHistoryState(), initial, added, edit);

  const undo = undoHistory(
    afterEdit,
    added,
    createHistoryEvent("undo", "Undo: Placed concept \"A\"", "2025-01-01T00:01:00.000Z", "undo-1"),
  );
  assert.deepEqual(undo?.state, initial);
  assert.equal(undo?.history.timeline.length, 2);
  assert.equal(undo?.history.timeline[1].kind, "undo");

  const redo = redoHistory(
    undo!.history,
    initial,
    createHistoryEvent("redo", "Redo: Placed concept \"A\"", "2025-01-01T00:02:00.000Z", "redo-1"),
  );
  assert.deepEqual(redo?.state, added);
  assert.equal(redo?.history.timeline.length, 3);
  assert.equal(redo?.history.past.length, 1);
});

test("a new edit clears redo state without erasing prior timeline events", () => {
  const added = { ...initial, conceptBank: [{ id: "concept-a", label: "A" }] };
  const afterEdit = recordHistoryEdit(
    createHistoryState(),
    initial,
    added,
    createHistoryEvent("edit", "Added concept \"A\"", "2025-01-01T00:00:00.000Z", "edit-1"),
  );
  const undone = undoHistory(
    afterEdit,
    added,
    createHistoryEvent("undo", "Undo: Added concept \"A\"", "2025-01-01T00:01:00.000Z", "undo-1"),
  )!;
  const next = { ...initial, relationBank: [{ id: "relation-r", label: "rel" }] };
  const changed = recordHistoryEdit(
    undone.history,
    undone.state,
    next,
    createHistoryEvent("edit", "Added relation \"rel\"", "2025-01-01T00:02:00.000Z", "edit-2"),
  );
  assert.equal(changed.future.length, 0);
  assert.deepEqual(changed.timeline.map(event => event.kind), ["edit", "undo", "edit"]);
});

test("backup export keeps native map fields, banks, and history together", () => {
  const history = createHistoryState([
    createHistoryEvent("edit", "Added concept \"A\"", "2025-01-01T00:00:00.000Z", "edit-1"),
  ]);
  const backup = createBackupDocument(
    { id: "map-1", title: "Map", concepts: [], propositions: [], layout: {}, meta: { edit_count: 1 } },
    [{ id: "concept-a", label: "A" }],
    [{ id: "relation-r", label: "rel" }],
    history,
  );
  assert.equal(backup.id, "map-1");
  assert.deepEqual(backup.concept_bank, [{ id: "concept-a", label: "A" }]);
  assert.deepEqual(backup.relation_bank, [{ id: "relation-r", label: "rel" }]);
  assert.equal(backup.history.timeline[0].action, "Added concept \"A\"");
});