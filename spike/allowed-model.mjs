// The only OpenRouter model ids a spike may call: the paid allowlist below, plus any id ending
// ":free". Everything else is a config error that aborts the arm. The guard exists because a
// silent fallback once hit a paid model unasked. Used by the workflow, run-arm.sh, the preflight
// and the supervisor, so there is one list.
//   CLI: node spike/allowed-model.mjs <id>   (exit 0 allowed, 3 refused; id may carry "openrouter/")
import { pathToFileURL } from "node:url";

export const PAID_ALLOWLIST = ["anthropic/claude-haiku-4.5"];
export const bareId = (id) => String(id ?? "").replace(/^openrouter\//, "");
export const isFree = (id) => bareId(id).endsWith(":free");
export const isAllowed = (id) => isFree(id) || PAID_ALLOWLIST.includes(bareId(id));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const id = process.argv[2];
  if (isAllowed(id)) process.exit(0);
  console.error(`config error: OpenRouter model '${id}' is not allowlisted (allowed: ${PAID_ALLOWLIST.join(", ")} or any id ending :free)`);
  process.exit(3);
}
