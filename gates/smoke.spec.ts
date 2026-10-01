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
      await expect(target).toBeVisible({ timeout: 10_000 });
      await page.screenshot({ path: path.join(SHOTS_DIR, `${step.id}-1280x800.png`) });

      await page.setViewportSize({ width: 390, height: 844 });
      await expect(target).toBeVisible({ timeout: 10_000 });
      const overflow = await hasHorizontalOverflow(page);
      expect(overflow, `horizontal overflow at 390px on ${step.route}`).toBe(false);
      await page.screenshot({ path: path.join(SHOTS_DIR, `${step.id}-390x844.png`) });

      expect(errors, `console errors on ${step.route}: ${errors.join("; ")}`).toEqual([]);
    });
  }

  test("produces cover.png from the edge-case screen at 1200x630", async ({ page }) => {
    // Cover art is the edge_case.screen_id screen (Denials for this brief),
    // scrolled so the flagged record is visible — never the story screen.
    await seedLoginAndTour(page);
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.goto("/#/denials");
    const edgeCaseRow = page.locator('[data-edge-case="true"]');
    await expect(edgeCaseRow).toBeVisible();
    await edgeCaseRow.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(prototypeDir, "cover.png") });
  });

  test("the edge-case record is visible without scrolling and its status changes only after the human-checkpoint action", async ({
    page,
  }) => {
    await seedLoginAndTour(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/#/denials");

    const edgeCaseRow = page.locator('[data-edge-case="true"]');
    await expect(edgeCaseRow).toBeVisible();
    const box = await edgeCaseRow.boundingBox();
    expect(box, "edge-case record must have a bounding box").not.toBeNull();
    expect(
      box!.y + box!.height,
      "edge-case record must render in the first viewport at 1280x800, with no scrolling"
    ).toBeLessThanOrEqual(800);
    await expect(edgeCaseRow).toContainText("Needs document");

    // Reloading without clicking anything must never change its status —
    // nothing moves on its own.
    await page.reload();
    const edgeCaseRowAfterReload = page.locator('[data-edge-case="true"]');
    await expect(edgeCaseRowAfterReload).toContainText("Needs document");

    // Only Dana's explicit actions change it: attach the document, move it
    // to appeals, then the human-checkpoint action (Submit appeal).
    await edgeCaseRowAfterReload.click();
    await page.getByRole("button", { name: "Attach missing document" }).click();
    await page.getByRole("button", { name: "Move to appeals" }).click();

    // In-app navigation (not page.goto) so the SPA's in-memory case state
    // carries over, exactly as it would for a real visitor.
    await page.getByRole("link", { name: "Appeals" }).click();
    const edgeCaseItem = page.locator('[data-edge-case="true"]');
    await expect(edgeCaseItem).toBeVisible();
    await edgeCaseItem.getByRole("button", { name: "Submit appeal" }).click();
    await expect(page.getByTestId("toast").filter({ hasText: "Submitted the appeal" })).toBeVisible({
      timeout: 1_500,
    });
  });

  test("every non-nav action produces a toast or navigation within 1.5s", async ({ page }) => {
    await seedLoginAndTour(page);

    // Tracker: "Open case" (row click) navigates to /case.
    await page.goto("/#/tracker");
    await page.locator('[data-tour="tracker-table-row-4471"]').click();
    await expect(page).toHaveURL(/#\/case\?case=4471/, { timeout: 1_500 });

    // Case: "Add note" produces a toast.
    await page.goto("/#/case?case=4471");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByTestId("toast").filter({ hasText: "Appended a timestamped note" })).toBeVisible({
      timeout: 1_500,
    });

    // Denials: Dana attaches the missing document and moves #4471 into the
    // appeals queue herself — nothing happens automatically.
    await page.goto("/#/denials");
    await page.locator('[data-tour="denial-row-4471"]').click();
    await page.getByRole("button", { name: "Attach missing document" }).click();
    await expect(page.getByTestId("toast").filter({ hasText: "Attached the missing document" })).toBeVisible({
      timeout: 1_500,
    });
    await page.getByRole("button", { name: "Move to appeals" }).click();
    await expect(page.getByTestId("toast").filter({ hasText: "Moved case #4471" })).toBeVisible({
      timeout: 1_500,
    });

    // Appeals: Dana reviews and submits #4471's appeal — the human checkpoint.
    // In-app navigation (not page.goto) so the SPA's in-memory case state
    // carries over, exactly as it would for a real visitor.
    await page.getByRole("link", { name: "Appeals" }).click();
    const edgeCaseItem = page.locator('[data-edge-case="true"]');
    await edgeCaseItem.getByRole("button", { name: "Submit appeal" }).click();
    await expect(page.getByTestId("toast").filter({ hasText: "Submitted the appeal" })).toBeVisible({
      timeout: 1_500,
    });
  });
});
