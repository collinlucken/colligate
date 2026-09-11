import type { EditableState } from "./history";

export type DeletionSelection = {
  conceptIds?: readonly string[];
  propositionId?: string | null;
};

/**
 * Remove the selected concepts or proposition without touching either user bank.
 *
 * This is deliberately kept separate from the UI so deleting a concept always
 * has the same incident-edge and layout semantics, including for undo/redo.
 */
export function deleteSelection(
  state: EditableState,
  selection: DeletionSelection,
): EditableState {
  const conceptIds = new Set(selection.conceptIds || []);
  const propositionId = selection.propositionId || null;
  const map = state.map || {};
  const concepts = Array.isArray(map.concepts) ? map.concepts : [];
  const propositions = Array.isArray(map.propositions) ? map.propositions : [];
  const nextConcepts = concepts.filter((concept: any) => !conceptIds.has(concept.id));
  const nextPropositions = propositions.filter((proposition: any) => (
    proposition.id !== propositionId &&
    !conceptIds.has(proposition.subject) &&
    !conceptIds.has(proposition.object)
  ));

  const layout = map.layout || {};
  const nextLayout = Object.fromEntries(
    Object.entries(layout).filter(([id]) => !conceptIds.has(id)),
  );
  const changed = nextConcepts.length !== concepts.length ||
    nextPropositions.length !== propositions.length ||
    Object.keys(nextLayout).length !== Object.keys(layout).length;
  if (!changed) return state;

  const nextMap: any = {
    ...map,
    concepts: nextConcepts,
    propositions: nextPropositions,
    layout: nextLayout,
  };
  if (map.meta) {
    nextMap.meta = {
      ...map.meta,
      edit_count: (map.meta.edit_count || 0) + 1,
    };
  }
  return { ...state, map: nextMap };
}

export const removeSelection = deleteSelection;