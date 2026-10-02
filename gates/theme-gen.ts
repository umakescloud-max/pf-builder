// theme:gen — reads a prototype's src/theme.ts palette (by regex, since this
// runs outside the Vite/TS toolchain) and prints the WCAG contrast ratio for
// every required pair, failing if any pair is below 4.5:1. Also used by
// check-static.ts as a shared function.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { contrastRatio, WCAG_AA_NORMAL_TEXT } from "../kit/src/theme/contrast.ts";

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
function writePresetTheme(palette: Palette, workspace: string, starterThemePath: string): void {
  let src = readFileSync(starterThemePath, "utf-8");
  for (const key of Object.keys(palette) as (keyof Palette)[]) {
    const re = new RegExp(`(${key}:\\s*")#[0-9a-fA-F]{6}(")`);
    if (!re.test(src)) throw new Error(`starter theme ${starterThemePath} is missing a palette.${key} hex value`);
    src = src.replace(re, `$1${palette[key]}$2`);
  }
  writeFileSync(path.join(workspace, "src", "theme.ts"), src);
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
    console.error("Usage: theme:gen <path-to-prototype-dir> | --preset <name> [--write <workspace>] | --presets");
    return 1;
  }
  let allPass = true;
  if (target === "--presets") {
    for (const [name, palette] of Object.entries(loadPalettes(palettesPath))) {
      if (!printChecks(`== preset ${name}`, palette)) allPass = false;
      console.log("");
    }
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
