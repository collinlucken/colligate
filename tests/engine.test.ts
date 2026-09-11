import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { compare, diagnoseStructure, infer, parseSentences, printSentences } from "../src/engine/index.ts";

const pack = JSON.parse(readFileSync("data/phil2400-f26.pack.json", "utf8"));
const student = parseSentences(readFileSync("data/student-demo.map.txt", "utf8"), pack, undefined, "2026-09-11T00:00:00.000Z");
const expert = parseSentences(readFileSync("data/sept2-expert.map.txt", "utf8"), pack, undefined, "2026-09-11T00:00:00.000Z");

test("matches student structure and inference counts", () => {
  assert.equal(diagnoseStructure(student, pack).concepts, 12);
  assert.equal(diagnoseStructure(student, pack).propositions, 12);
  assert.equal(infer(student, pack).implied.length, 3);
  assert.equal(infer(student, pack).conflicts.length, 1);
  assert.equal(infer(student, pack).ill_typed.length, 1);
});

test("matches the fixture comparison cardinalities", () => {
  const result = compare(student, expert, pack);
  assert.equal(result.shared.length, 4);
  assert.equal(result.only_student.length, 8);
  assert.equal(result.only_expert.length, 10);
  assert.equal(result.disputes.length, 3);
  assert.equal(result.recall, 0.29);
  assert.equal(result.precision, 0.33);
  assert.equal(result.f1, 0.31);
  assert.equal(result.goldsmith, 0.41);
  assert.equal(result.concepts_shared, 10);
});

test("matches the full expert fixture summary", () => {
  const structure = diagnoseStructure(expert, pack);
  assert.deepEqual(
    {
      concepts: structure.concepts,
      propositions: structure.propositions,
      components: structure.components,
      cycles: structure.cycles,
      diameter: structure.diameter,
      hub: structure.hub,
      hub_degree: structure.hub_degree,
      spoke: structure.spoke,
      chain: structure.chain,
      degree2: structure.degree2,
      roots: structure.roots,
      free: structure.free,
      weak: structure.weak,
      orphans: structure.orphans,
      density: structure.density,
      degrees: structure.degrees,
    },
    JSON.parse(readFileSync("data/expected-outputs.json", "utf8")).sept2_expert.structure,
  );
  assert.equal(infer(expert, pack).implied.length, 1);
});

test("preserves learned time and novel concepts across sentence round trips", () => {
  const first = parseSentences("New thing -> relates oddly -> Mind", pack, undefined, "2026-09-11T00:00:00.000Z");
  const printed = printSentences(first, pack);
  const second = parseSentences(printed, pack, first, "2026-09-11T01:00:00.000Z");
  assert.equal(printed, "New thing -> relates oddly -> Mind");
  assert.equal(second.propositions[0].learned_at, first.propositions[0].learned_at);
  assert.equal(second.propositions[0].subject, first.propositions[0].subject);
});

test("preserves unlinked concept-bank nodes during sentence edits", () => {
  const withOrphan = {
    ...student,
    concepts: [...student.concepts, {
      id: "c-chatgpt",
      label: "ChatGPT",
      type: "system-or-example",
      pack_id: pack.id,
    }],
  };
  const reparsed = parseSentences(
    printSentences(withOrphan, pack),
    pack,
    withOrphan,
    "2026-09-11T02:00:00.000Z",
  );
  assert.ok(reparsed.concepts.some(concept => concept.id === "c-chatgpt"));
});

test("detects a cycle through a transitive relation and records provenance", () => {
  const cycle = parseSentences(
    "NFAI -> is a kind of -> GOFAI\nGOFAI -> is a kind of -> NFAI",
    pack,
    undefined,
    "2026-09-11T00:00:00.000Z",
  );
  const result = infer(cycle, pack);
  assert.ok(result.taxonomic_cycles.length >= 1);
  assert.ok(result.implied.every(item => item.derived_from.length >= 2));
});

test("accepts legacy native maps without metadata and keeps proposition IDs unique", () => {
  const native = JSON.parse(readFileSync("data/student-demo.map.json", "utf8"));
  const firstText = printSentences(native, pack);
  const reparsed = parseSentences(`${firstText}\nChatGPT -> is an example of -> Mind`, pack, native, "2026-09-11T03:00:00.000Z");
  assert.ok(reparsed.meta.created_at);
  assert.equal(new Set(reparsed.propositions.map(proposition => proposition.id)).size, reparsed.propositions.length);

  const reorderedText = printSentences({...reparsed, propositions: [...reparsed.propositions].reverse()}, pack);
  const reordered = parseSentences(`${reorderedText}\nTokens -> is related to -> Mind`, pack, reparsed, "2026-09-11T04:00:00.000Z");
  assert.equal(new Set(reordered.propositions.map(proposition => proposition.id)).size, reordered.propositions.length);
});