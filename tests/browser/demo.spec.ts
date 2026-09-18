import {
  test, expect, storedMap, storedConcepts, storedRelations,
  panel, metric, createConcept, createRelation,
} from "./helpers";

test("builds a map only from user-created concepts and relations", async ({ page }) => {
  await createConcept(page, "Mind", "core-concept");
  await createConcept(page, "Intentionality", "core-concept");
  await createConcept(page, "Dennett", "figure");
  await createRelation(page, "is constituted by");
  await createRelation(page, "was explained by");

  await expect(page.locator(".bank-heading")).toContainText("Your concept bank · 3");
  await expect(page.locator(".relation-bank")).toContainText("Your relation bank · 2");
  expect(await storedConcepts(page)).toHaveLength(3);
  expect(await storedRelations(page)).toHaveLength(2);

  // Search narrows the user's bank; clicking explicitly places a concept.
  await page.getByPlaceholder("Search your concepts").fill("mind");
  await expect(page.locator(".chips").getByRole("button")).toHaveCount(1);
  await page.locator(".chips").getByRole("button", { name: "Mind", exact: true }).click();
  await page.getByPlaceholder("Search your concepts").fill("");
  await page.locator(".chips").getByRole("button", { name: "Intentionality", exact: true }).click();
  await page.locator(".chips").getByRole("button", { name: "Dennett", exact: true }).click();
  await expect(page.locator(".node")).toHaveCount(3);

  const mind = page.getByRole("button", { name: "Mind, core concept", exact: true });
  const intentionality = page.getByRole("button", { name: "Intentionality, core concept", exact: true });
  await mind.press("Enter");
  await intentionality.press("Enter");
  const picker = page.getByRole("dialog", { name: "Choose a relation" });
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: "is constituted by", exact: true }).click();

  await expect(page.getByLabel("Read-only propositions")).toContainText("Mind is constituted by Intentionality");
  await expect(page.locator(".edge")).toHaveCount(1);
  await expect(page.locator(".pill")).toHaveText("1 propositions");
  const manual = panel(page, "You make every connection");
  for (const [label, value] of [["bank concepts", "3"], ["bank relations", "2"], ["arrows added", "1"]])
    await metric(manual, label, value);

  const map = await storedMap(page);
  expect(map.concepts).toHaveLength(3);
  expect(map.propositions).toHaveLength(1);
  expect(map.propositions[0]).toMatchObject({
    relation: { free: "is constituted by" },
    status: "asserted",
    derived_from: null,
  });
  expect(map.meta.added_by).toEqual({ typed: 0, drawn: 1, accepted_inference: 0 });
  expect(map.meta.edit_count).toBe(4);
});

test("persists banks, focus, layout, propositions, and process evidence", async ({ page }) => {
  await createConcept(page, "Formal System", "system-or-example");
  await createConcept(page, "Rules", "core-concept");
  await createRelation(page, "uses");
  for (const label of ["Formal System", "Rules"])
    await page.locator(".chips").getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("button", { name: "Formal System, system or example" }).press("Enter");
  await page.getByRole("button", { name: "Rules, core concept" }).press("Enter");
  await page.getByRole("dialog", { name: "Choose a relation" })
    .getByRole("button", { name: "uses", exact: true }).click();

  const beforeDrag = await storedMap(page);
  const node = page.getByRole("button", { name: "Rules, core concept" });
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 75, box.y + box.height / 2 + 45, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await storedMap(page)).meta.edit_count).toBe(beforeDrag.meta.edit_count + 1);

  await page.locator(".focus input").fill("How do formal systems use rules?");
  await expect.poll(async () => (await storedMap(page)).meta.session_seconds).toBeGreaterThan(0);
  const persisted = await storedMap(page);
  expect(persisted.focus_question).toBe("How do formal systems use rules?");
  expect(persisted.meta.added_by.drawn).toBe(1);
  expect(persisted.layout[persisted.concepts.find((c: any) => c.label === "Rules").id].x).toBeGreaterThan(330);

  await page.reload();
  await expect(page.locator(".focus input")).toHaveValue("How do formal systems use rules?");
  await expect(page.getByLabel("Read-only propositions")).toContainText("Formal System uses Rules");
  await expect(page.locator(".node")).toHaveCount(2);
  expect(await storedConcepts(page)).toHaveLength(2);
  expect(await storedRelations(page)).toHaveLength(1);
  const restored = await storedMap(page);
  expect(restored.propositions).toEqual(persisted.propositions);
  expect(restored.layout).toEqual(persisted.layout);
  expect(restored.meta.edit_count).toBe(persisted.meta.edit_count);
  expect(restored.meta.added_by).toEqual(persisted.meta.added_by);
});

test("structure evidence updates as manually assembled branches connect", async ({ page }) => {
  for (const label of ["A", "B", "C", "D"]) await createConcept(page, label);
  await createRelation(page, "connects");
  for (const label of ["A", "B", "C", "D"])
    await page.locator(".chips").getByRole("button", { name: label, exact: true }).click();
  const structure = panel(page, "What shape is this?");
  await metric(structure, "components", "4");

  for (const [subject, object] of [["A", "B"], ["C", "D"], ["B", "C"]]) {
    await page.getByRole("button", { name: `${subject}, novel`, exact: true }).press("Enter");
    await page.getByRole("button", { name: `${object}, novel`, exact: true }).press("Enter");
    await page.getByRole("dialog", { name: "Choose a relation" })
      .getByRole("button", { name: "connects", exact: true }).click();
  }
  await metric(structure, "components", "1");
  await metric(structure, "propositions", "3");
  await structure.getByRole("button", { name: "show your work" }).click();
  await expect(structure.locator(".derivation")).toContainText("4 concepts, 3 propositions, and 1 connected components");
  await expect(structure.locator(".derivation")).toContainText("Independent cycles");
  expect((await storedMap(page)).meta.added_by.drawn).toBe(3);
});

test("rejects duplicate vocabulary without changing the map", async ({ page }) => {
  await createConcept(page, "Mind");
  await createConcept(page, "mind");
  await createRelation(page, "explains");
  await createRelation(page, "EXPLAINS");
  expect(await storedConcepts(page)).toHaveLength(1);
  expect(await storedRelations(page)).toHaveLength(1);
  const before = await storedMap(page);
  expect((await storedMap(page)).propositions).toEqual(before.propositions);
  expect((await storedMap(page)).meta.edit_count).toBe(before.meta.edit_count);
});