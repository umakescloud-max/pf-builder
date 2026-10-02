// Prints the archetype's Gate Contract addendum (contracts/archetypes/<archetype>/gate-contract.md)
// with every {{path.in.roles.json}} filled from that archetype's roles.json, so a value like a
// row-id prefix has one home. Appended to the builder prompt by run-arm.sh.
//   CLI: node spike/render-archetype-contract.mjs <archetype>   (exit 3 + message on any problem)
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const contractsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "contracts", "archetypes");

export function renderContract(archetype, dir = contractsDir) {
  const read = (file) => {
    try { return readFileSync(path.join(dir, archetype, file), "utf8"); }
    catch (e) { throw new Error(`no ${file} for archetype "${archetype}" in ${dir}: ${e.code ?? e.message}`); }
  };
  const roles = JSON.parse(read("roles.json"));
  return read("gate-contract.md").replace(/\{\{([^}]+)\}\}/g, (_, p) => {
    const v = p.trim().split(".").reduce((o, k) => o?.[k], roles);
    if (typeof v !== "string") throw new Error(`gate-contract.md placeholder {{${p}}} does not resolve to a string in roles.json`);
    return v;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(renderContract(process.argv[2])); }
  catch (e) { console.error(`archetype contract error: ${e.message}`); process.exit(3); }
}
