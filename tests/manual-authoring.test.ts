import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const app = readFileSync("src/main.tsx", "utf8");

test("the authoring UI starts from user-created banks", () => {
  assert.doesNotMatch(app, /packDefault|phil2400-f26\.pack/);
  assert.doesNotMatch(app, /localStorage\.getItem\(["']weft-pack/);
  assert.match(app, /MANUAL_CONCEPT_BANK_STORAGE/);
  assert.match(app, /MANUAL_RELATION_BANK_STORAGE/);
  assert.match(app, /aria-label="Add concept"/);
  assert.match(app, /aria-label="Add relation"/);
});

test("propositions can only be authored from canvas selections and relation-bank entries", () => {
  assert.doesNotMatch(app, /parseSentences|printSentences|<textarea|loadMap|loadPack/);
  assert.doesNotMatch(app, /onClick=\{\(\)=>addRelation\(\{free/);
  assert.match(app, /if \(selected\.length !== 2\) return/);
  assert.match(app, /relation: \{ free: relation\.label \}/);
  assert.match(app, /relationBank\.map\(relation/);
  assert.match(app, /aria-label="Read-only propositions"/);
});

test("legacy map storage is read without importing its former course bank", () => {
  assert.match(app, /const LEGACY_MAP_STORAGE = "weft-map"/);
  assert.match(app, /const MANUAL_MAP_STORAGE = "weft-manual-map"/);
  assert.match(app, /restoredLegacy/);
  assert.doesNotMatch(app, /localStorage\.getItem\(["']weft-pack/);
});