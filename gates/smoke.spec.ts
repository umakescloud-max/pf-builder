import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

interface TourStep {
  id: string;
  route: string;
  target: string;
  title: string;
  body: string;
}

const prototypeDir = process.env.PROTOTYPE_DIR
  ? path.resolve(process.env.PROTOTYPE_DIR)
  : path.resolve(__dirname, "..", "prototypes", "prior-auth-tracker-v1");

const tour: TourStep[] = JSON.parse(readFileSync(path.join(prototypeDir, "src", "tour.json"), "utf-8"));

// The brief is the single source of truth for routes, action labels and toast
// text. Nothing below is hand-typed against it. run-arm.sh passes BRIEF_PATH.
interface BriefAction { label: string; effect: string }
interface BriefScreen { id: string; route: string; actions: BriefAction[] }
const briefPath = process.env.BRIEF_PATH
  ? path.resolve(process.env.BRIEF_PATH)
  : path.resolve(__dirname, "..", "spike", "inputs", "sample-brief.json");
const brief = JSON.parse(readFileSync(briefPath, "utf-8"));
const screen = (id: string): BriefScreen => {
  const s = (brief.screens as BriefScreen[]).find((x) => x.id === id);
  if (!s) throw new Error(`brief has no screen "${id}"`);
  return s;
};
const label = (screenId: string, actionLabel: string): string => {
  const a = screen(screenId).actions.find((x) => x.label === actionLabel);
  if (!a) throw new Error(`brief screen "${screenId}" has no action "${actionLabel}"`);
  return a.label;
};
const effect = (screenId: string, actionLabel: string): string => {
  const a = screen(screenId).actions.find((x) => x.label === actionLabel);
  if (!a) throw new Error(`brief screen "${screenId}" has no action "${actionLabel}"`);
  return a.effect;
};
const edgeRoute = screen(brief.edge_case.screen_id).route;
// Assumes brief.edge_case.scenario names the case as "#<digits>" and quotes the
// denial reason in single quotes, e.g. "Case #4471 (...) denied with reason code 'missing clinical documentation'".
const edgeIdMatch = /#(\d+)/.exec(brief.edge_case.scenario);
if (!edgeIdMatch) throw new Error(`edge_case.scenario has no "#<id>": ${brief.edge_case.scenario}`);
const edgeCaseId = edgeIdMatch[1];
const denialMatch = /'([^']+)'/.exec(brief.edge_case.scenario);
if (!denialMatch) throw new Error(`edge_case.scenario has no 'quoted denial reason': ${brief.edge_case.scenario}`);
const denialReason = denialMatch[1];

const SHOTS_DIR = path.join(__dirname, "..", "shots");
mkdirSync(SHOTS_DIR, { recursive: true });

const LOGIN_KEY = `pf-login-${path.basename(prototypeDir)}`;
const TOUR_KEY = `pf-tour-${path.basename(prototypeDir)}`;

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

// Pre-seeds login + "tour already seen" so neither the login gate nor the
// tour overlay covers the target element while a test checks its visibility.
async function seedLoginAndTour(page: Page) {
  await page.addInitScript(
    ({ loginKey, tourKey }) => {
      window.localStorage.setItem(loginKey, "1");
      window.localStorage.setItem(tourKey, "1");
    },
    { loginKey: LOGIN_KEY, tourKey: TOUR_KEY }
  );
}

test.describe("smoke", () => {
  test("login gate works and the tour auto-starts for a first-time visitor", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/");

    const continueButton = page.locator('[data-tour="one-click-login"]');
    await expect(continueButton).toBeVisible();
    await continueButton.click();

    // Tour auto-starts after a short delay (see TourRunner.tsx).
    await expect(page.locator(".driver-popover")).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press("Escape");

    expect(errors, `console errors: ${errors.join("; ")}`).toEqual([]);
  });

  for (const step of tour) {
    test(`tour step "${step.id}" renders its target on ${step.route}`, async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await seedLoginAndTour(page);

      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`/#${step.route}`);
      const target = page.locator(`[data-tour="${step.target}"]`);
      await page.screenshot({ path: path.join(SHOTS_DIR, `${step.id}-1280x800.png`) });
      await expect(target).toBeVisible({ timeout: 10_000 });

      await page.setViewportSize({ width: 390, height: 844 });
      await expect(target).toBeVisible({ timeout: 10_000 });
      const overflow = await hasHorizontalOverflow(page);
      expect(overflow, `horizontal overflow at 390px on ${step.route}`).toBe(false);
      await page.screenshot({ path: path.join(SHOTS_DIR, `${step.id}-390x844.png`) });

      expect(errors, `console errors on ${step.route}: ${errors.join("; ")}`).toEqual([]);
    });
  }

  test("produces cover.png from the edge-case screen at 1200x630", async ({ page }) => {
    // Cover art is the edge_case.screen_id screen, scrolled so the flagged
    // record is visible — never the story screen.
    await seedLoginAndTour(page);
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.goto(`/#${edgeRoute}`);
    await page.screenshot({ path: path.join(SHOTS_DIR, "cover-initial-1200x630.png") }); // diagnostic; survives a failure
    const edgeCaseRow = page.locator('[data-edge-case="true"]');
    await expect(edgeCaseRow).toBeVisible();
    await edgeCaseRow.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(prototypeDir, "cover.png") }); // keep: the real cover must be taken after the scroll
  });

  test("the edge-case record is visible without scrolling and its status changes only after the human-checkpoint action", async ({
    page,
  }) => {
    await seedLoginAndTour(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/#${edgeRoute}`);
    await page.screenshot({ path: path.join(SHOTS_DIR, "edge-case-initial.png") });

    const edgeCaseRow = page.locator('[data-edge-case="true"]');
    await expect(edgeCaseRow).toBeVisible();
    const box = await edgeCaseRow.boundingBox();
    expect(box, "edge-case record must have a bounding box").not.toBeNull();
    expect(
      box!.y + box!.height,
      "edge-case record must render in the first viewport at 1280x800, with no scrolling"
    ).toBeLessThanOrEqual(800);
    await expect(edgeCaseRow).toContainText(denialReason);
    const rowTextBefore = await edgeCaseRow.innerText();

    // Reloading without clicking anything must never change its status —
    // nothing moves on its own.
    await page.reload();
    const edgeCaseRowAfterReload = page.locator('[data-edge-case="true"]');
    await expect(edgeCaseRowAfterReload).toHaveText(rowTextBefore); // nothing moves on its own

    // Only Dana's explicit actions change it: attach the document, move it
    // to appeals, then the human-checkpoint action (Submit appeal).
    await edgeCaseRowAfterReload.click();
    await page.getByRole("button", { name: label("denials", "Attach missing document") }).click();
    await page.getByRole("button", { name: label("denials", "Move to appeals") }).click();

    // In-app navigation (not page.goto) so the SPA's in-memory case state
    // carries over, exactly as it would for a real visitor.
    await page.locator(`a[href="#${screen("appeals").route}"]`).click();
    const edgeCaseItem = page.locator('[data-edge-case="true"]');
    await expect(edgeCaseItem).toBeVisible();
    await edgeCaseItem.getByRole("button", { name: label("appeals", "Submit appeal") }).click();
    await expect(page.getByTestId("toast").filter({ hasText: effect("appeals", "Submit appeal") })).toBeVisible({
      timeout: 1_500,
    });
  });

  test("every non-nav action produces a toast or navigation within 1.5s", async ({ page }) => {
    await seedLoginAndTour(page);

    // Tracker: "Open case" (row click) navigates to /case.
    await page.goto(`/#${screen("tracker").route}`);
    await page.screenshot({ path: path.join(SHOTS_DIR, "actions-tracker-initial.png") });
    await page.locator(`[data-tour="tracker-table-row-${edgeCaseId}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#${screen("case").route}\\?case=${edgeCaseId}`), { timeout: 1_500 });

    // Case: "Add note" produces a toast.
    await page.goto(`/#${screen("case").route}?case=${edgeCaseId}`);
    await page.getByRole("button", { name: label("case", "Add note") }).click();
    await expect(page.getByTestId("toast").filter({ hasText: effect("case", "Add note") })).toBeVisible({
      timeout: 1_500,
    });

    // Denials: Dana attaches the missing document and moves the case into the
    // appeals queue herself — nothing happens automatically.
    await page.goto(`/#${screen("denials").route}`);
    await page.screenshot({ path: path.join(SHOTS_DIR, "actions-denials-initial.png") });
    await page.locator(`[data-tour="denial-row-${edgeCaseId}"]`).click();
    await page.getByRole("button", { name: label("denials", "Attach missing document") }).click();
    await expect(page.getByTestId("toast").filter({ hasText: effect("denials", "Attach missing document") })).toBeVisible({
      timeout: 1_500,
    });
    await page.getByRole("button", { name: label("denials", "Move to appeals") }).click();
    await expect(page.getByTestId("toast").filter({ hasText: effect("denials", "Move to appeals") })).toBeVisible({
      timeout: 1_500,
    });

    // Appeals: Dana reviews and submits the appeal — the human checkpoint.
    // In-app navigation (not page.goto) so the SPA's in-memory case state
    // carries over, exactly as it would for a real visitor.
    await page.locator(`a[href="#${screen("appeals").route}"]`).click();
    const edgeCaseItem = page.locator('[data-edge-case="true"]');
    await edgeCaseItem.getByRole("button", { name: label("appeals", "Submit appeal") }).click();
    await expect(page.getByTestId("toast").filter({ hasText: effect("appeals", "Submit appeal") })).toBeVisible({
      timeout: 1_500,
    });
  });
});
