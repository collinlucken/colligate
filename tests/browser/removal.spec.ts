import { test, expect } from "@playwright/test";

test("selects an edge with keyboard focus and removes it with undo/redo support", async ({ page }) => {
  const now = "2025-01-01T00:00:00.000Z";
  const map = {
    id: "map-removal",
    title: "Removal test",
    focus_question: "",
    genre: "concept",
    pack_id: "manual-user-authorship",
    concepts: [
      { id: "a", label: "A", type: "concept", pack_id: null },
      { id: "b", label: "B", type: "concept", pack_id: null },
      { id: "c", label: "C", type: "concept", pack_id: null },
    ],
    propositions: [
      { id: "ab", subject: "a", relation: { free: "connects" }, object: "b", status: "asserted" },
      { id: "bc", subject: "b", relation: { free: "connects" }, object: "c", status: "asserted" },
    ],
    layout: {
      a: { x: 120, y: 180 },
      b: { x: 400, y: 180 },
      c: { x: 680, y: 180 },
    },
    submaps: {},
    meta: {
      created_at: now,
      last_saved_at: now,
      session_seconds: 0,
      edit_count: 0,
      added_by: { typed: 0, drawn: 0, accepted_inference: 0 },
    },
  };
  await page.addInitScript(({ storedMap }) => {
    localStorage.clear();
    localStorage.setItem("weft-manual-map", JSON.stringify(storedMap));
    localStorage.setItem("weft-manual-concept-bank", JSON.stringify([
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ]));
    localStorage.setItem("weft-manual-relation-bank", JSON.stringify([
      { id: "connects", label: "connects" },
    ]));
  }, { storedMap: map });
  await page.goto("/");

  const remove = page.getByRole("button", { name: "Remove", exact: true });
  await expect(remove).toBeDisabled();
  const edge = page.getByRole("button", { name: "A connects B edge" });
  await edge.focus();
  await expect(remove).toBeEnabled();
  await edge.press("Enter");
  await remove.click();
  await expect(page.locator(".edge")).toHaveCount(1);
  await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem("weft-manual-map")!))).propositions.length).toBe(1);

  const banks = await page.evaluate(() => ({
    concepts: JSON.parse(localStorage.getItem("weft-manual-concept-bank")!),
    relations: JSON.parse(localStorage.getItem("weft-manual-relation-bank")!),
  }));
  expect(banks.concepts).toHaveLength(3);
  expect(banks.relations).toHaveLength(1);

  await page.getByRole("button", { name: "Undo last action" }).click();
  await expect(page.locator(".edge")).toHaveCount(2);
  await page.getByRole("button", { name: "Redo last action" }).click();
  await expect(page.locator(".edge")).toHaveCount(1);
});