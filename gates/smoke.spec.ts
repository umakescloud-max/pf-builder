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

// The brief and the archetype contract are the single source of truth for
// screens, roles, action labels, toast text and row ids. Nothing below is
// hand-typed against them. run-arm.sh passes BRIEF_PATH; the contract is
// contracts/archetypes/<brief.archetype>/roles.json (shared with validate-brief
// and the builder prompt).
interface BriefAction { label: string; toast: string; kind: string; role?: string }
interface BriefScreen { id: string; route: string; actions: BriefAction[] }
interface RolesContract {
  edge_case_role: string;
  human_checkpoint_role: string;
  action_roles: Record<string, Record<string, { kind: string }>>;
  row_id_prefix: Record<string, string>;
  detail_query_param: string;
}
const pfBuilderRoot = path.resolve(__dirname, "..");
const briefPath = process.env.BRIEF_PATH
  ? path.resolve(process.env.BRIEF_PATH)
  : path.join(pfBuilderRoot, "spike", "inputs", "sample-brief.json");
const brief = JSON.parse(readFileSync(briefPath, "utf-8"));

// A role or action that cannot be resolved is a brief/contract problem, not a
// builder problem: say exactly which one, never a bare TypeError.
function fail(msg: string): never {
  throw new Error(`smoke gate: ${msg} (brief ${briefPath})`);
}
const contractPath = path.join(pfBuilderRoot, "contracts", "archetypes", String(brief.archetype), "roles.json");
let contract: RolesContract;
try {
  contract = JSON.parse(readFileSync(contractPath, "utf-8"));
} catch (e) {
  fail(`no readable archetype contract for brief.archetype "${brief.archetype}" at ${contractPath}: ${(e as Error).message}`);
}
const screenById = (id: string): BriefScreen =>
  (brief.screens as BriefScreen[] | undefined)?.find((s) => s.id === id) ?? fail(`brief has no screen "${id}"`);
const screenByRole = (role: string): BriefScreen =>
  screenById(brief.roles?.[role] ?? fail(`brief.roles has no role "${role}"`));
// An action is found by its role (brief screen holding the screen role, then the
// action carrying the action role) and must have the kind the contract fixes.
const actionByRole = (screenRole: string, actionRole: string): BriefAction => {
  const want = contract.action_roles?.[screenRole]?.[actionRole] ?? fail(`contract has no action role "${actionRole}" on screen role "${screenRole}"`);
  const screen = screenByRole(screenRole);
  const a = screen.actions.find((x) => x.role === actionRole) ?? fail(`screen "${screen.id}" (role ${screenRole}) has no action with role "${actionRole}"`);
  if (a.kind !== want.kind) fail(`action "${a.label}" (role ${actionRole}) has kind "${a.kind}", the contract needs "${want.kind}"`);
  return a;
};
// Accessible name of a kind:"button" action. Row-click and nav actions are not buttons.
const buttonName = (screenRole: string, actionRole: string): string => {
  const a = actionByRole(screenRole, actionRole);
  return a.kind === "button" ? a.label : fail(`action "${a.label}" (role ${actionRole}) is kind "${a.kind}", not a button`);
};
const toastText = (screenRole: string, actionRole: string): string => actionByRole(screenRole, actionRole).toast;
const rowId = (screenRole: string, recordId: string): string =>
  `${contract.row_id_prefix?.[screenRole] ?? fail(`contract has no row_id_prefix for screen role "${screenRole}"`)}${recordId}`;

// The prior-auth flow, by role. Role names come from roles.json; nothing here is a
// screen id, action label or row-id prefix.
const LIST = "tracker";
const DETAIL = "case";
const EDGE = contract.edge_case_role;
const CHECKPOINT = contract.human_checkpoint_role;
const detailParam = contract.detail_query_param ?? fail("contract has no detail_query_param");

const edgeScreen = screenById(brief.edge_case.screen_id);
if (edgeScreen.id !== brief.roles?.[EDGE]) {
  fail(`edge_case.screen_id "${edgeScreen.id}" is not the screen with role "${EDGE}" ("${brief.roles?.[EDGE]}")`);
}
const edgeRoute = edgeScreen.route;
const edgeCaseId: string = brief.edge_case.record_id ?? fail("brief.edge_case.record_id is missing");
const denialReason: string = brief.edge_case.label ?? fail("brief.edge_case.label is missing");
const checkpointScreen = screenById(brief.human_checkpoint.screen_id);
if (checkpointScreen.id !== brief.roles?.[CHECKPOINT]) {
  fail(`human_checkpoint.screen_id "${checkpointScreen.id}" is not the screen with role "${CHECKPOINT}" ("${brief.roles?.[CHECKPOINT]}")`);
}

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
    await edgeCaseRow.scrollIntoViewIfNeeded();
    await expect(edgeCaseRow).toBeInViewport();
    const precedingRows = await edgeCaseRow.evaluate((el) => {
      let n = 0;
      for (let r = (el.closest("tr") ?? el).previousElementSibling; r; r = r.previousElementSibling) n++;
      return n;
    });
    expect(precedingRows, "edge-case row must be among the first 5 rows of its table").toBeLessThan(5);
    await expect(edgeCaseRow).toContainText(denialReason);
    const rowTextBefore = ((await edgeCaseRow.textContent()) ?? "")
      .replace(/\s+/g, " ")
      .trim();

    // Reloading without clicking anything must never change its status —
    // nothing moves on its own.
    await page.reload();
    const edgeCaseRowAfterReload = page.locator('[data-edge-case="true"]');
    await expect(edgeCaseRowAfterReload).toHaveText(rowTextBefore); // nothing moves on its own

    // Only the user's explicit actions change it: attach the document, move it
    // to appeals, then the human-checkpoint action (submit-appeal).
    await edgeCaseRowAfterReload.click();
    await page.getByRole("button", { name: buttonName(EDGE, "attach-document") }).click();
    await page.getByRole("button", { name: buttonName(EDGE, "move-to-appeals") }).click();

    // In-app navigation (not page.goto) so the SPA's in-memory case state
    // carries over, exactly as it would for a real visitor.
    await page.locator(`a[href="#${checkpointScreen.route}"]`).click();
    const edgeCaseItem = page.locator('[data-edge-case="true"]');
    await expect(edgeCaseItem).toBeVisible();
    await edgeCaseItem.getByRole("button", { name: buttonName(CHECKPOINT, "submit-appeal") }).click();
    await expect(page.getByTestId("toast").filter({ hasText: toastText(CHECKPOINT, "submit-appeal") })).toBeVisible({
      timeout: 1_500,
    });
  });

  test("every non-nav action produces a toast or navigation within 1.5s", async ({ page }) => {
    await seedLoginAndTour(page);

    // List screen: the open-case row click navigates to the detail screen.
    await page.goto(`/#${screenByRole(LIST).route}`);
    await page.screenshot({ path: path.join(SHOTS_DIR, "actions-tracker-initial.png") });
    await page.locator(`[data-tour="${rowId(LIST, edgeCaseId)}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#${screenByRole(DETAIL).route}\\?${detailParam}=${edgeCaseId}`), { timeout: 1_500 });

    // Detail screen: the add-note button produces a toast.
    await page.goto(`/#${screenByRole(DETAIL).route}?${detailParam}=${edgeCaseId}`);
    await page.getByRole("button", { name: buttonName(DETAIL, "add-note") }).click();
    await expect(page.getByTestId("toast").filter({ hasText: toastText(DETAIL, "add-note") })).toBeVisible({
      timeout: 1_500,
    });

    // Edge screen: the user attaches the document and moves the case into the
    // appeals queue herself — nothing happens automatically.
    await page.goto(`/#${screenByRole(EDGE).route}`);
    await page.screenshot({ path: path.join(SHOTS_DIR, "actions-denials-initial.png") });
    await page.locator(`[data-tour="${rowId(EDGE, edgeCaseId)}"]`).click();
    await page.getByRole("button", { name: buttonName(EDGE, "attach-document") }).click();
    await expect(page.getByTestId("toast").filter({ hasText: toastText(EDGE, "attach-document") })).toBeVisible({
      timeout: 1_500,
    });
    await page.getByRole("button", { name: buttonName(EDGE, "move-to-appeals") }).click();
    await expect(page.getByTestId("toast").filter({ hasText: toastText(EDGE, "move-to-appeals") })).toBeVisible({
      timeout: 1_500,
    });

    // Checkpoint screen: the user reviews and submits — the human checkpoint.
    // In-app navigation (not page.goto) so the SPA's in-memory case state
    // carries over, exactly as it would for a real visitor.
    await page.locator(`a[href="#${checkpointScreen.route}"]`).click();
    const edgeCaseItem = page.locator('[data-edge-case="true"]');
    await edgeCaseItem.getByRole("button", { name: buttonName(CHECKPOINT, "submit-appeal") }).click();
    await expect(page.getByTestId("toast").filter({ hasText: toastText(CHECKPOINT, "submit-appeal") })).toBeVisible({
      timeout: 1_500,
    });
  });
});
