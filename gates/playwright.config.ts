import { defineConfig } from "@playwright/test";
import path from "node:path";

// PROTOTYPE_DIR points at the demo being gated — defaults to the Phase 1
// proof build. build.yml overrides this per real build.
const prototypeDir = process.env.PROTOTYPE_DIR
  ? path.resolve(process.env.PROTOTYPE_DIR)
  : path.resolve(__dirname, "..", "prototypes", "prior-auth-tracker-v1");

const PORT = 4321;

// Local runs reuse the system Edge via the "msedge" channel with a clean
// temporary profile — never `npx playwright install` on Farid's machine.
// CI (build.yml) installs its own Chromium on the GitHub-hosted runner and
// leaves `channel` undefined so Playwright uses that bundled browser.
// See DECISIONS.md "Playwright" for the rationale.
export default defineConfig({
  testDir: ".",
  testMatch: /smoke\.spec\.ts/,
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.CI ? undefined : "msedge",
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    cwd: prototypeDir,
    port: PORT,
    timeout: 30_000,
    reuseExistingServer: !process.env.CI,
  },
  reporter: [["list"]],
});

export { prototypeDir };
