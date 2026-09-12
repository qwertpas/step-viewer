import { test, expect } from "@playwright/test";
import { basename, resolve } from "node:path";

const fixture = resolve("test/fixtures/bracket.step");
const assembly = resolve("test/fixtures/nested-brackets.step");
const modifier = process.platform === "darwin" ? "Meta" : "Control";
// Interior points on the public bracket in the configured 1440 × 900 initial view:
// top: (30,20,12), ring: (-5,-5,22), circle: (9/√2,-9/√2,22), all in mm.
const points = { top: [0.544131, 0.489792], ring: [0.242557, 0.399863], circle: [0.289695, 0.427946] };
const topArea = "Face area: 2,336.3827 mm²";

async function open(page, file = fixture) {
  await page.locator("#file-input").setInputFiles(file);
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#status")).toHaveText(/\d+ parts?/);
  await expect(page.locator("#file-name")).toHaveText(basename(file));
}

async function clickModel(page, point, modifiers = []) {
  const canvas = page.locator("#canvas canvas");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await canvas.click({ position: { x: bounds.width * point[0], y: bounds.height * point[1] }, modifiers });
}

function errorsFrom(page) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  return errors;
}

test("cached reopen and failed replacement retain measurable CAD", async ({ page }) => {
  const errors = errorsFrom(page);
  await page.goto("/");
  await open(page);
  const stats = await page.locator("#model-stats").textContent();
  await expect(page.locator("#measure")).toBeEnabled();
  await expect(page.locator("#section")).toBeEnabled();
  await open(page);
  await expect(page.locator("#model-stats")).toHaveText(stats);
  const measures = await page.evaluate(() => performance.getEntriesByType("measure").map(e => e.name));
  expect(measures).toContain("cad-load");
  expect(measures).not.toContain("cad-kernelMs");
  await page.locator("#file-input").setInputFiles({ name: "broken.step", mimeType: "text/plain", buffer: Buffer.from("invalid STEP") });
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#status")).toHaveText("No solid CAD geometry was found");
  await expect(page.locator("#file-name")).toHaveText("bracket.step");
  await expect(page.locator("#measure")).toBeEnabled();
  await page.locator("#measure").click();
  await clickModel(page, points.top);
  await expect(page.locator("#selection-result")).toHaveText(topArea);
  await open(page);
  expect(errors).toEqual([]);
});

test("nested lazy expansion inherits hidden parents and Show all can be undone precisely", async ({ page }) => {
  const errors = errorsFrom(page);
  await page.goto("/");
  await open(page, assembly);
  await expect(page.locator("#status")).toHaveText("4 parts");
  const children = (item) => item.locator(":scope > .component-children > .component-item");
  const row = (item) => item.locator(":scope > .component-row");
  const visibility = (item) => row(item).locator(".visibility-button");
  const expand = (item) => row(item).locator(".branch-button").click();
  const root = page.locator("#component-tree > .component-item");
  const left = children(root).nth(0), right = children(root).nth(1);
  await expect(row(root).locator(".component-name")).toHaveText("Viewer fixture");
  await expect(row(left).locator(".component-name")).toHaveText("Left bank");
  await expect(row(right).locator(".component-name")).toHaveText("Right bank");
  await expect(page.locator(".component-row")).toHaveCount(3);
  await expect(children(left)).toHaveCount(0);

  await visibility(left).click();
  await expect(visibility(left)).toHaveAttribute("aria-pressed", "false");
  await expect(visibility(right)).toHaveAttribute("aria-pressed", "true");
  await expect(visibility(root)).toHaveAttribute("aria-pressed", "mixed");
  await expand(left);
  const pair = children(left);
  await expect(row(pair).locator(".component-name")).toHaveText("Bracket pair");
  await expect(visibility(pair)).toHaveAttribute("aria-pressed", "false");
  await expect(children(pair)).toHaveCount(0);
  await expand(pair);
  const first = children(pair).nth(0), second = children(pair).nth(1);
  await expect(row(first).locator(".component-name")).toHaveText("Bracket_1");
  await expect(row(second).locator(".component-name")).toHaveText("Bracket_2");
  await expect(visibility(first)).toHaveAttribute("aria-pressed", "false");
  await expect(visibility(second)).toHaveAttribute("aria-pressed", "false");

  await visibility(first).click();
  await expect(visibility(pair)).toHaveAttribute("aria-pressed", "mixed");
  await expect(visibility(left)).toHaveAttribute("aria-pressed", "mixed");
  await page.locator("#show-all").click();
  await expect(visibility(root)).toHaveAttribute("aria-pressed", "true");
  await expect(visibility(second)).toHaveAttribute("aria-pressed", "true");
  // Mount the other bank after Show all, then undo without losing its visibility.
  await expand(right);
  const otherPair = children(right);
  await expand(otherPair);
  await expect(page.locator(".component-row")).toHaveCount(9);
  await expect(visibility(children(otherPair).nth(0))).toHaveAttribute("aria-pressed", "true");
  await expect(visibility(children(otherPair).nth(1))).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press(`${modifier}+z`);
  await expect(visibility(first)).toHaveAttribute("aria-pressed", "true");
  await expect(visibility(second)).toHaveAttribute("aria-pressed", "false");
  await expect(visibility(left)).toHaveAttribute("aria-pressed", "mixed");
  await expect(visibility(right)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press(`${modifier}+z`);
  await expect(visibility(left)).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press(`${modifier}+z`);
  await expect(visibility(root)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press(`${modifier}+Shift+z`);
  await expect(visibility(left)).toHaveAttribute("aria-pressed", "false");
  await expect(visibility(right)).toHaveAttribute("aria-pressed", "true");
  await page.locator("#collapse-tree").click();
  await expect(page.locator(".component-row:visible")).toHaveCount(1);
  await page.locator("#expand-tree").click();
  await expect(page.locator(".component-row:visible")).toHaveCount(9);
  await expect(visibility(first)).toHaveAttribute("aria-pressed", "false");
  await expect(visibility(children(otherPair).nth(0))).toHaveAttribute("aria-pressed", "true");
  await page.locator("#hide-all").click();
  await expect(visibility(root)).toHaveAttribute("aria-pressed", "false");
  await expect(visibility(right)).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press(`${modifier}+z`);
  await expect(visibility(left)).toHaveAttribute("aria-pressed", "false");
  await expect(visibility(right)).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("face area, shifted face distance and circular edge diameter use exact CAD", async ({ page }) => {
  const errors = errorsFrom(page);
  await page.goto("/");
  await open(page);
  await clickModel(page, points.top);
  await expect(page.locator("#selection-result")).toHaveText("Selected");
  await expect(page.locator(".component-row.selected")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("#selection-panel")).toBeHidden();
  await page.locator("#measure").click();
  await clickModel(page, points.top);
  await expect(page.locator("#selection-result")).toHaveText(topArea);
  await clickModel(page, points.ring, ["Shift"]);
  await expect(page.locator("#selection-result")).toHaveText("Minimum distance: 10 mm");
  await expect(page.locator("#dimension-label")).toBeVisible();
  await expect(page.locator("#dimension-label")).toHaveText("10 mm");
  await clickModel(page, points.circle);
  await expect(page.locator("#selection-result")).toHaveText("Diameter: 18 mm\nRadius: 9 mm");
  await expect(page.locator("#dimension-label")).toHaveText("Ø 18 mm");
  await page.locator("#clear-selection").click();
  await expect(page.locator("#selection-result")).toHaveText("Select a face or edge");
  await expect(page.locator("#dimension-label")).toBeHidden();
  expect(errors).toEqual([]);
});

test("section offset blocks cut faces, Flip exposes them, and Pick face and Clear restore controls", async ({ page }) => {
  const errors = errorsFrom(page);
  await page.goto("/");
  await open(page);
  await page.locator("#section").click();
  await expect(page.locator("#measure")).toBeDisabled();
  await expect(page.locator("#section-fields")).toBeHidden();
  await clickModel(page, points.top);
  await expect(page.locator("#section-fields")).toBeVisible();
  await expect(page.locator("#section-offset")).toHaveValue("0");
  await page.locator("#section-offset").fill("-6");
  await page.locator("#section-done").click();
  await expect(page.locator("#section-panel")).toBeHidden();
  await expect(page.locator("#section")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#measure").click();
  await clickModel(page, points.top);
  await expect(page.locator("#selection-result")).toHaveText("Select a face or edge");

  await page.locator("#section").click();
  await page.locator("#section-flip").click();
  await expect(page.locator("#section-offset")).toHaveValue("-6");
  await page.locator("#section-done").click();
  await page.locator("#measure").click();
  await clickModel(page, points.top);
  await expect(page.locator("#selection-result")).toHaveText(topArea);
  await page.locator("#section").click();
  await page.locator("#section-pick").click();
  await clickModel(page, points.ring);
  await expect(page.locator("#section-offset")).toHaveValue("0");
  await page.locator("#section-clear").click();
  await expect(page.locator("#section-panel")).toBeHidden();
  await expect(page.locator("#section")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#measure")).toBeEnabled();
  await page.locator("#measure").click();
  await clickModel(page, points.top);
  await expect(page.locator("#selection-result")).toHaveText(topArea);
  expect(errors).toEqual([]);
});
