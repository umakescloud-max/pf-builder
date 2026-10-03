// theme:gen — reads a prototype's src/theme.ts palette (by regex, since this
// runs outside the Vite/TS toolchain) and prints the WCAG contrast ratio for
// every required pair, failing if any pair is below 4.5:1. Also used by
// check-static.ts as a shared function.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { contrastRatio, WCAG_AA_NORMAL_TEXT } from "../kit/src/theme/contrast.ts";
import { FONTSOURCE_PACKAGE } from "../kit/src/fonts/index.ts";

export interface Palette {
  surface: string;
  ink: string;
  primary: string;
  accent: string;
  muted: string;
}

export function extractPalette(themeFilePath: string): Palette {
  const src = readFileSync(themeFilePath, "utf-8");
  const get = (key: keyof Palette): string => {
    const match = src.match(new RegExp(`${key}:\\s*"(#[0-9a-fA-F]{6})"`));
    if (!match) throw new Error(`theme.ts at ${themeFilePath} is missing a palette.${key} hex value`);
    return match[1];
  };
  return {
    surface: get("surface"),
    ink: get("ink"),
    primary: get("primary"),
    accent: get("accent"),
    muted: get("muted"),
  };
}

export interface ContrastCheck {
  pair: string;
  ratio: number;
  pass: boolean;
}

// Accent is a fill color only (ink text on an accent background) and is
// never checked as text on surface, because it's never used that way.
export function requiredPairs(palette: Palette): [string, string, string][] {
  return [
    ["ink/surface", palette.ink, palette.surface],
    ["muted/surface", palette.muted, palette.surface],
    ["primary/surface", palette.primary, palette.surface],
    ["surface/primary", palette.surface, palette.primary],
    ["ink/accent", palette.ink, palette.accent],
  ];
}

export function checkContrast(palette: Palette): ContrastCheck[] {
  return requiredPairs(palette).map(([pair, a, b]) => {
    const ratio = contrastRatio(a, b);
    return { pair, ratio, pass: ratio >= WCAG_AA_NORMAL_TEXT };
  });
}

// Presets live in contracts/palettes.json (the single source; validate-brief
// checks design.palette against the same file). Same contrast function as above.
export function loadPalettes(palettesPath: string): Record<string, Palette> {
  return JSON.parse(readFileSync(palettesPath, "utf-8"));
}

export function presetPalette(name: string, palettesPath: string): Palette {
  const presets = loadPalettes(palettesPath);
  if (!presets[name]) throw new Error(`no palette preset "${name}" in ${palettesPath} (have: ${Object.keys(presets).join(", ")})`);
  return presets[name];
}

// --preset <name> --write <workspace>: the starter's src/theme.ts with ONLY the five palette
// hex values replaced by the preset's, written to <workspace>/src/theme.ts.
function writePresetTheme(palette: Palette, workspace: string, starterThemePath: string, typefaces?: { heading: string; body: string }): void {
  let src = readFileSync(starterThemePath, "utf-8");
  for (const key of Object.keys(palette) as (keyof Palette)[]) {
    const re = new RegExp(`(${key}:\\s*")#[0-9a-fA-F]{6}(")`);
    if (!re.test(src)) throw new Error(`starter theme ${starterThemePath} is missing a palette.${key} hex value`);
    src = src.replace(re, `$1${palette[key]}$2`);
  }
  // --brief mode only: the brief's typefaces too (--preset mode leaves them as the starter has them).
  for (const key of ["heading", "body"] as const) {
    if (!typefaces) break;
    const re = new RegExp(`(${key}:\\s*")[^"]*(")`);
    if (!re.test(src)) throw new Error(`starter theme ${starterThemePath} is missing typefaces.${key}`);
    src = src.replace(re, `$1${typefaces[key]}$2`);
  }
  writeFileSync(path.join(workspace, "src", "theme.ts"), src);
}

const SCREEN_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/; // same pattern as brief.schema.json screens[].id

// --brief <brief.json> --write <workspace>: everything brief-dependent, before the baseline snapshot.
// theme.ts (palette + typefaces), routes.generated.ts, fonts.generated.ts, and src/screens/ reduced to exactly
// one <id>.tsx per brief screen (sample-brief screens already match, so for the sample this deletes and stubs nothing).
// check-static.ts parses routes.generated.ts by regex on `path: "..."`: keep that format in step with it.
function writeBriefFiles(briefPath: string, workspace: string, root: string): boolean {
  const brief = JSON.parse(readFileSync(briefPath, "utf-8"));
  const palette = presetPalette(brief.design?.palette, path.join(root, "contracts", "palettes.json"));
  const allPass = printChecks(`== preset ${brief.design.palette}`, palette);
  if (!allPass) return false;
  const typefaces: { heading: string; body: string } = brief.design.typefaces;
  const src = path.join(workspace, "src");

  writePresetTheme(palette, workspace, path.join(root, "archetypes", "prior-auth-rcm", "src", "theme.ts"), typefaces);

  const screens: { id: string; route: string }[] = brief.screens;
  for (const s of screens) if (!SCREEN_ID.test(s.id)) throw new Error(`screen id "${s.id}" is not a valid lowercase filename`);
  writeFileSync(
    path.join(src, "routes.generated.ts"),
    "// Generated by theme:gen from the brief. Do not edit.\nexport const routes: { id: string; path: string }[] = [\n" +
      screens.map((s) => `  { id: ${JSON.stringify(s.id)}, path: ${JSON.stringify(s.route)} },`).join("\n") +
      "\n];\n",
  );

  const imports: string[] = [];
  for (const face of new Set([typefaces.heading, typefaces.body])) {
    const slug = FONTSOURCE_PACKAGE[face];
    if (!slug || !existsSync(path.join(root, "node_modules", "@fontsource", slug))) {
      throw new Error(`typeface "${face}" is not installed (@fontsource/${slug ?? "?"}); only Public Sans and Source Serif 4 are`);
    }
    for (const weight of [400, 600]) imports.push(`import "@fontsource/${slug}/${weight}.css";`);
  }
  writeFileSync(path.join(src, "fonts.generated.ts"), "// Generated by theme:gen from the brief. Do not edit.\n" + imports.join("\n") + "\n");

  const screensDir = path.join(src, "screens");
  mkdirSync(screensDir, { recursive: true });
  const ids = new Set(screens.map((s) => s.id));
  for (const f of readdirSync(screensDir)) if (f.endsWith(".tsx") && !ids.has(f.slice(0, -4))) rmSync(path.join(screensDir, f));
  for (const id of ids) {
    const file = path.join(screensDir, `${id}.tsx`);
    if (!existsSync(file)) writeFileSync(file, `export default function Screen() {\n  return <div>Screen not built: ${id}</div>;\n}\n`);
  }
  return true;
}

function printChecks(label: string, palette: Palette): boolean {
  const checks = checkContrast(palette);
  if (label) console.log(label);
  console.log(`Palette: ${JSON.stringify(palette)}`);
  console.log("");
  console.log("Contrast ratios (WCAG AA normal text requires >= 4.5:1):");
  for (const c of checks) {
    console.log(`  ${c.pair.padEnd(16)} ${c.ratio.toFixed(2)}:1  ${c.pass ? "PASS" : "FAIL"}`);
  }
  return checks.every((c) => c.pass);
}

// usage: theme-gen <prototype-dir> | --preset <name> [--write <workspace>] | --presets
// Returns the exit code.
function main(entry: string): number {
  const [target, presetName, writeFlag, workspace] = process.argv.slice(2);
  const palettesPath = path.join(path.dirname(entry), "..", "contracts", "palettes.json");
  if (!target) {
    console.error("Usage: theme:gen <path-to-prototype-dir> | --preset <name> [--write <workspace>] | --brief <brief.json> --write <workspace> | --presets");
    return 1;
  }
  let allPass = true;
  if (target === "--presets") {
    for (const [name, palette] of Object.entries(loadPalettes(palettesPath))) {
      if (!printChecks(`== preset ${name}`, palette)) allPass = false;
      console.log("");
    }
  } else if (target === "--brief") {
    if (writeFlag !== "--write" || !workspace) throw new Error("--brief <brief.json> needs --write <workspace>");
    allPass = writeBriefFiles(presetName, workspace, path.join(path.dirname(entry), ".."));
  } else if (target === "--preset") {
    const palette = presetPalette(presetName, palettesPath);
    allPass = printChecks(`== preset ${presetName}`, palette);
    if (writeFlag === "--write") {
      if (!workspace) throw new Error("--write needs a <workspace> path");
      if (allPass) writePresetTheme(palette, workspace, path.join(path.dirname(entry), "..", "archetypes", "prior-auth-rcm", "src", "theme.ts"));
    }
  } else {
    allPass = printChecks("", extractPalette(path.join(target, "src", "theme.ts")));
  }
  if (!allPass) {
    console.error("\ntheme:gen FAILED — one or more required pairs are below 4.5:1.");
    return 1;
  }
  console.log("\ntheme:gen PASSED.");
  return 0;
}

const entry = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (entry.endsWith("gates/theme-gen.ts")) {
  process.exit(main(entry));
}
