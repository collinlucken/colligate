import { test as base, expect, type Locator, type Page } from "@playwright/test";

export const test = base.extend<{ healthyPage: void }>({
  healthyPage: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Your map in sentences" })).toBeVisible();
    await use();
    expect(errors, "No uncaught browser errors").toEqual([]);
  }, { auto: true }],
});
export { expect };

export const storedMap = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("weft-manual-map")!));
export const storedConcepts = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("weft-manual-concept-bank")!));
export const storedRelations = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("weft-manual-relation-bank")!));
export const panel = (page: Page, heading: string) =>
  page.locator(".panel").filter({ has: page.getByRole("heading", { name: heading, exact: true }) });
export async function metric(container: Locator, label: string, value: string) {
  await expect(container.locator(".metric").filter({ hasText: new RegExp(`${label}$`) }).locator("strong")).toHaveText(value);
}
export async function createConcept(page: Page, label: string, type = "novel") {
  const form = page.getByRole("form", { name: "Add concept" });
  await form.getByPlaceholder("Concept label").fill(label);
  await form.getByLabel("Concept type").selectOption(type);
  await form.getByRole("button", { name: "Add concept" }).click();
}
export async function createRelation(page: Page, label: string) {
  const form = page.getByRole("form", { name: "Add relation" });
  await form.getByPlaceholder("Relation label").fill(label);
  await form.getByRole("button", { name: "Add relation" }).click();
}