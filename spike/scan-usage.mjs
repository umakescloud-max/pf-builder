// Parses one attempt log for request count + peak tokens/request.
// Gemini CLI: run with --output-format json, so the log is a JSON object
// with a token-usage block. Aider: --no-pretty still prints one
// "Tokens: <n>k? sent, <n>k? received." line per exchange.
// OpenCode: --format json, one event per line; each step_finish is one model
// request carrying part.tokens (total, or input+output).
// Prints "<requests> <peak_tokens>" — "unknown" for either field that
// couldn't be read. Never prints 0 for a signal that just wasn't found.
import { readFileSync } from "node:fs";

const [, , logFile, builder] = process.argv;
const raw = readFileSync(logFile, "utf-8");

function fromGeminiJson() {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  let requests = 0;
  let peak = 0;
  (function walk(node) {
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (/token/i.test(k) && typeof v === "number") peak = Math.max(peak, v);
        else walk(v);
      }
    }
  })(parsed);
  const models = parsed?.stats?.models;
  if (models && typeof models === "object") requests = Object.keys(models).length;
  if (peak === 0 && requests === 0) return null;
  return { requests: requests || "unknown", peak_tokens: peak || "unknown" };
}

function fromAiderText() {
  const re = /Tokens:\s*([\d.]+)(k)?\s*sent,(?:[^,\n]*cache[^,\n]*,)?\s*([\d.]+)(k)?\s*received/gi;
  let requests = 0;
  let peak = 0;
  let m;
  while ((m = re.exec(raw))) {
    requests++;
    const sent = parseFloat(m[1]) * (m[2] ? 1000 : 1);
    const received = parseFloat(m[3]) * (m[4] ? 1000 : 1);
    peak = Math.max(peak, sent + received);
  }
  // A response that hits the model's output cap prints no "Tokens:" line; aider
  // prints "Total tokens: ~N" instead (run 6: laguna-s-2.1, ~67k, looped to the cap).
  const lim = /Total tokens:\s*~([\d,]+)/g;
  while ((m = lim.exec(raw))) {
    requests++;
    peak = Math.max(peak, parseInt(m[1].replace(/,/g, ""), 10));
  }
  if (requests === 0) return null;
  return { requests, peak_tokens: Math.round(peak) };
}

function fromOpencodeJson() {
  let requests = 0;
  let peak = 0;
  for (const line of raw.split(String.fromCharCode(10))) {
    if (!line.startsWith("{")) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (ev.type !== "step_finish") continue;
    requests++;
    const t = ev.part?.tokens;
    if (t) peak = Math.max(peak, t.total ?? (t.input ?? 0) + (t.output ?? 0));
  }
  if (requests === 0) return null;
  return { requests, peak_tokens: peak || "unknown" };
}

const parse = { "gemini-cli": fromGeminiJson, opencode: fromOpencodeJson }[builder] ?? fromAiderText;
const result = parse() ?? { requests: "unknown", peak_tokens: "unknown" };
console.log(`${result.requests} ${result.peak_tokens}`);
