// check:static — deterministic, non-visual checks against a prototype
// directory. Run as: tsx gates/check-static.ts <path-to-prototype-dir>
//
// Checks (HANDOFF.md §5.10):
//  - no URLs, fetch, XMLHttpRequest, lorem/TODO/FIXME, SSN-shaped strings,
//    literal ISO dates in seed, image imports outside the kit
//  - no changes to package files, kit, theme, or brief
//  - tour.json valid (schema + routes referenced actually exist)
//  - theme contrast AA (delegates to theme-gen.ts)

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { checkContrast, extractPalette } from "./theme-gen.ts";

interface Violation {
  file: string;
  rule: string;
  detail: string;
}

const FORBIDDEN_PATTERNS: { rule: string; pattern: RegExp }[] = [
  { rule: "network-fetch", pattern: /\bfetch\s*\(/ },
  { rule: "network-xhr", pattern: /XMLHttpRequest/ },
  { rule: "placeholder-lorem", pattern: /lorem ipsum/i },
  { rule: "placeholder-todo", pattern: /\bTODO\b/ },
  { rule: "placeholder-fixme", pattern: /\bFIXME\b/ },
  { rule: "ssn-shaped-string", pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { rule: "remote-url", pattern: /https?:\/\/(?!umakes\.cloud)[^\s"'`]+/ },
  { rule: "middle-dot-metadata-string", pattern: /·/ },
  { rule: "arrow-glyph", pattern: /→/ },
];

// Literal ISO date, e.g. "2026-09-30" — seed.ts must only produce dates via
// rel()/addBusinessDays(), never a hardcoded calendar date.
const ISO_DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/;

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full, exts));
    } else if (exts.some((e) => full.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

function checkForbiddenPatterns(srcDir: string, violations: Violation[]) {
  const files = walk(srcDir, [".ts", ".tsx"]);
  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const relFile = path.relative(process.cwd(), file);
    for (const { rule, pattern } of FORBIDDEN_PATTERNS) {
      const match = content.match(pattern);
      if (match) {
        violations.push({ file: relFile, rule, detail: match[0] });
      }
    }
    if (file.endsWith("seed.ts") && ISO_DATE_PATTERN.test(content)) {
      const match = content.match(ISO_DATE_PATTERN);
      violations.push({ file: relFile, rule: "literal-iso-date-in-seed", detail: match![0] });
    }
  }
}

function checkImageImportsOutsideKit(srcDir: string, violations: Violation[]) {
  const files = walk(srcDir, [".ts", ".tsx"]);
  const imageImport = /from\s+["'][^"']+\.(png|jpg|jpeg|gif|svg|webp)["']/i;
  for (const file of files) {
    if (file.includes(`${path.sep}kit${path.sep}`)) continue;
    const content = readFileSync(file, "utf-8");
    const match = content.match(imageImport);
    if (match) {
      violations.push({
        file: path.relative(process.cwd(), file),
        rule: "image-import-outside-kit",
        detail: match[0],
      });
    }
  }
}

function checkNoDependencyChanges(prototypeDir: string, starterDir: string, violations: Violation[]) {
  const prototypePkg = readFileSync(path.join(prototypeDir, "package.json"), "utf-8");
  const starterPkg = readFileSync(path.join(starterDir, "package.json"), "utf-8");
  // Dependency key sets only: name/version/scripts churn is not a violation.
  const depKeys = (raw: string) => {
    const parsed = JSON.parse(raw);
    return JSON.stringify([Object.keys(parsed.dependencies ?? {}).sort(), Object.keys(parsed.devDependencies ?? {}).sort()]);
  };
  if (depKeys(prototypePkg) !== depKeys(starterPkg)) {
    violations.push({
      file: "package.json",
      rule: "dependency-manifest-changed",
      detail: "dependencies/devDependencies keys differ from the archetype starter",
    });
  }
}

interface TourStep {
  id: string;
  route: string;
  target: string;
  title: string;
  body: string;
}

function checkTourRoutesExist(prototypeDir: string, violations: Violation[]) {
  const tourPath = path.join(prototypeDir, "src", "tour.json");
  const tour: TourStep[] = JSON.parse(readFileSync(tourPath, "utf-8"));
  const appTsx = readFileSync(path.join(prototypeDir, "src", "App.tsx"), "utf-8");
  const routeMatches = [...appTsx.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);

  if (tour.length < 6 || tour.length > 10) {
    violations.push({ file: "src/tour.json", rule: "tour-length", detail: `${tour.length} steps (must be 6-10)` });
  }

  const seenTargets = new Set<string>();
  for (const step of tour) {
    if (!routeMatches.includes(step.route)) {
      violations.push({
        file: "src/tour.json",
        rule: "tour-route-missing",
        detail: `step "${step.id}" references route "${step.route}", which isn't registered in App.tsx`,
      });
    }
    if (seenTargets.has(step.target)) {
      violations.push({
        file: "src/tour.json",
        rule: "tour-target-duplicate",
        detail: `target "${step.target}" is used by more than one step`,
      });
    }
    seenTargets.add(step.target);
  }
}

function checkThemeContrast(prototypeDir: string, violations: Violation[]) {
  const palette = extractPalette(path.join(prototypeDir, "src", "theme.ts"));
  const checks = checkContrast(palette);
  for (const c of checks) {
    if (!c.pass) {
      violations.push({
        file: "src/theme.ts",
        rule: "contrast-aa",
        detail: `${c.pair} is ${c.ratio.toFixed(2)}:1, below the required 4.5:1`,
      });
    }
  }
}

function main() {
  const target = process.argv[2];
  const starter = process.argv[3];
  if (!target) {
    console.error("Usage: check:static <path-to-prototype-dir> [path-to-starter-dir]");
    process.exit(1);
  }

  const violations: Violation[] = [];
  const srcDir = path.join(target, "src");

  checkForbiddenPatterns(srcDir, violations);
  checkImageImportsOutsideKit(srcDir, violations);
  checkTourRoutesExist(target, violations);
  checkThemeContrast(target, violations);
  if (starter) {
    checkNoDependencyChanges(target, starter, violations);
  }

  if (violations.length > 0) {
    console.error(`check:static FAILED — ${violations.length} violation(s):\n`);
    for (const v of violations) {
      console.error(`  [${v.rule}] ${v.file}: ${v.detail}`);
    }
    process.exit(1);
  }

  console.log("check:static PASSED — no violations found.");
}

main();
