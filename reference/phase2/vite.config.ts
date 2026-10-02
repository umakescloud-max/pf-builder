import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// base must become "/<name>-vN/" at publish time (vite.config is rewritten,
// or the value is injected via env, by build.yml) — "/" here is correct
// for local dev and for the Phase 1 local proof build.
export default defineConfig({
  base: "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@kit": path.resolve(__dirname, "../../kit/src"),
    },
  },
});
