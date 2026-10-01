// OpenRouter spend ceiling. /key `usage` is the key's lifetime USD spend, so a dispatch's spend is
// usage now minus usage at dispatch start (PF_SPEND_START, taken by the preflight job).
//   CLI: node spike/spend.mjs   env: OPENROUTER_API_KEY, PF_SPEND_START, PF_SPEND_CEILING (default 2.00)
//   prints {usage, start, spent, ceiling}; exit 0 under the ceiling, 7 at/over it, 8 if usage can't be read
//   or the start baseline is missing (fail closed: a paid arm must never run unmetered).
import { pathToFileURL } from "node:url";

const BASE = () => process.env.PF_OPENROUTER_BASE ?? "https://openrouter.ai/api/v1";

export async function readUsage(key, tries = 3) {
  let last = "no attempt";
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${BASE()}/key`, { headers: { Authorization: `Bearer ${key}` } });
      const u = (await res.json())?.data?.usage;
      if (res.ok && typeof u === "number") return u;
      last = `HTTP ${res.status}, usage=${u}`;
    } catch (e) { last = String(e); }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`cannot read OpenRouter /key usage: ${last}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { OPENROUTER_API_KEY: key, PF_SPEND_START, PF_SPEND_CEILING = "2.00" } = process.env;
  const start = Number(PF_SPEND_START), ceiling = Number(PF_SPEND_CEILING);
  if (!key || PF_SPEND_START === undefined || PF_SPEND_START === "" || !Number.isFinite(start) || !(ceiling > 0)) {
    console.error("spend check cannot run: need OPENROUTER_API_KEY, a numeric PF_SPEND_START and a positive PF_SPEND_CEILING");
    process.exit(8);
  }
  try {
    const usage = await readUsage(key);
    const spent = Math.round((usage - start) * 1e6) / 1e6;
    console.log(JSON.stringify({ usage, start, spent, ceiling }));
    process.exit(spent >= ceiling ? 7 : 0);
  } catch (e) { console.error(String(e)); process.exit(8); }
}
