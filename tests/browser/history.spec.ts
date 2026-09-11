import { test, expect } from "@playwright/test";

const emptyMap = {
  id: "map-history",
  title: "History test",
  focus_question: "",
  genre: "concept",
  pack_id: "manual-user-authorship",
  concepts: [],
  propositions: [],
  layout: {},
  submaps: {},
  meta: {
    created_at: "2025-01-01T00:00:00.000Z",
    last_saved_at: "2025-01-01T00:00:00.000Z",
    session_seconds: 0,
    edit_count: 0,
    added_by: { typed: 0, drawn: 0, accepted_inference: 0 },
  },
};

test("commits one focus edit and restores its timeline entry after refresh", async ({ page }) => {
  await page.addInitScript(({ storedMap }) => {
    if (localStorage.getItem("history-focus-test-seeded")) return;
    localStorage.clear();
    localStorage.setItem("weft-manual-map", JSON.stringify(storedMap));
    localStorage.setItem("history-focus-test-seeded", "1");
  }, { storedMap: emptyMap });
  await page.goto("/");

  const input = page.getByLabel("Focus question");
  const timeline = page.getByLabel("Map history timeline");
  await expect(timeline.locator(".timeline-entry")).toHaveCount(0);

  await input.fill("How do rules shape a system?");
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("weft-manual-map")!))).focus_question).toBe("");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("weft-manual-history")!).timeline)).toHaveLength(0);

  await input.blur();
  await expect(timeline.locator(".timeline-entry")).toHaveCount(1);
  await expect(timeline.locator(".timeline-entry").first()).toContainText("Changed the focus question");
  await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem("weft-manual-map")!))).focus_question)
    .toBe("How do rules shape a system?");
  await page.reload();
  await expect(input).toHaveValue("How do rules shape a system?");
  await expect(page.getByLabel("Map history timeline").locator(".timeline-entry").first())
    .toContainText("Changed the focus question");
});

test("click-only node selection is not history, while a completed drag is one action", async ({ page }) => {
  const storedMap = {
    ...emptyMap,
    concepts: [
      { id: "a", label: "A", type: "concept", pack_id: null },
      { id: "b", label: "B", type: "concept", pack_id: null },
    ],
    layout: { a: { x: 120, y: 180 }, b: { x: 420, y: 180 } },
  };
  await page.addInitScript(({ storedMap }) => {
    if (localStorage.getItem("history-drag-test-seeded")) return;
    localStorage.clear();
    localStorage.setItem("weft-manual-map", JSON.stringify(storedMap));
    localStorage.setItem("weft-manual-concept-bank", JSON.stringify([
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ]));
    localStorage.setItem("history-drag-test-seeded", "1");
  }, { storedMap });
  await page.goto("/");

  const timeline = page.getByLabel("Map history timeline");
  const node = page.locator(".canvas .node").filter({ hasText: "A" });
  await node.click();
  await expect(timeline.locator(".timeline-entry")).toHaveCount(0);

  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  await expect(timeline.locator(".timeline-entry")).toHaveCount(1);
  await expect(timeline.locator(".timeline-entry").first()).toContainText('Moved node "A"');
  await page.reload();
  await expect(page.getByLabel("Map history timeline").locator(".timeline-entry")).toHaveCount(1);
});