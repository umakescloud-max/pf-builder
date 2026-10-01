// theme:gen — reads a prototype's src/theme.ts palette (by regex, since this
// runs outside the Vite/TS toolchain) and prints the WCAG contrast ratio for
// every required pair, failing if any pair is below 4.5:1. Also used by
// check-static.ts as a shared function.

import { readFileSync } from "node:fs";
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

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: theme:gen <path-to-prototype-dir>");
    process.exit(1);
  }
  const themeFile = path.join(target, "src", "theme.ts");
  const palette = extractPalette(themeFile);
  const checks = checkContrast(palette);

  console.log(`Palette: ${JSON.stringify(palette)}`);
  console.log("");
  console.log("Contrast ratios (WCAG AA normal text requires >= 4.5:1):");
  let allPass = true;
  for (const c of checks) {
    const status = c.pass ? "PASS" : "FAIL";
    if (!c.pass) allPass = false;
    console.log(`  ${c.pair.padEnd(16)} ${c.ratio.toFixed(2)}:1  ${status}`);
  }

  if (!allPass) {
    console.error("\ntheme:gen FAILED — one or more required pairs are below 4.5:1.");
    process.exit(1);
  }
  console.log("\ntheme:gen PASSED.");
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("gates/theme-gen.ts");
if (invokedDirectly) {
  main();
}
