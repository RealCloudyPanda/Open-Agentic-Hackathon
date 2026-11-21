// Build each site's resolved network JSON from its canonical HOCON, and stamp the SRI
// digest of its coded-tool bundle into agent-manifest.json.
//
// Usage: node scripts/build-networks.mjs [--check]
//   --check  Build in memory only; exit 1 if any file on disk is out of date or invalid.
//
// Uses the vendored runtime's own parser and validator, so what passes here is exactly
// what the browser runtime will accept.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHocon } from "../vendor/nsdeploy-runtime/hocon.js";
import { AgentNetwork, validateNetwork } from "../vendor/nsdeploy-runtime/kernel.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function sriDigest(text) {
  return `sha256-${createHash("sha256").update(text, "utf8").digest("base64")}`;
}

/** Collect string leaves that still hold template markers. */
function leftovers(value, where = "", out = []) {
  if (typeof value === "string") {
    if (/\bTODO\b/.test(value) || /<[a-z_ ]+>/i.test(value)) out.push(`${where}: "${value.trim().slice(0, 60)}"`);
  } else if (Array.isArray(value)) value.forEach((v, i) => leftovers(v, `${where}[${i}]`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) leftovers(v, where ? `${where}.${k}` : k, out);
  return out;
}

/** Build one site in memory. Returns { outputs: Map<file, text>, errors: [] }. */
export async function buildSite(folder) {
  const errors = [];
  const outputs = new Map();
  const manifestPath = path.join(folder, "agent-manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return { outputs, errors, skipped: true };
    throw err;
  }
  const imports = new Set((manifest.linking?.imports || []).map((i) => i.reference));

  for (const entry of manifest.networks || []) {
    const hoconPath = path.join(folder, `${entry.name}.hocon`);
    let source;
    try {
      source = await readFile(hoconPath, "utf8");
    } catch {
      errors.push(`${entry.name}: missing ${path.relative(ROOT, hoconPath)}`);
      continue;
    }
    if (/^\s*include\b/m.test(source)) errors.push(`${entry.name}: include directives are not allowed (data-only).`);
    if (/\$\{[^}]*\}/.test(source)) errors.push(`${entry.name}: \${...} substitutions are not allowed (data-only).`);
    let config;
    try {
      config = parseHocon(source);
    } catch (err) {
      errors.push(`${entry.name}: HOCON parse error: ${err.message}`);
      continue;
    }
    for (const l of leftovers(config)) errors.push(`${entry.name}: template marker left at ${l}`);
    const network = new AgentNetwork(config, entry.name);
    const v = validateNetwork(network);
    for (const e of v.errors) errors.push(`${entry.name}: ${e}`);
    const front = network.findFrontMan();
    if (front !== entry.front_man) errors.push(`${entry.name}: manifest front_man '${entry.front_man}' but the network's front agent is '${front}'.`);
    if (entry.hocon !== `./${entry.name}.network.json`) errors.push(`${entry.name}: manifest hocon must be ./${entry.name}.network.json`);
    for (const slot of Object.keys(config.link_slots || {})) {
      if (!imports.has(slot)) errors.push(`${entry.name}: link slot '${slot}' is not declared in linking.imports.`);
    }
    outputs.set(path.join(folder, `${entry.name}.network.json`), `${JSON.stringify(config, null, 2)}\n`);
  }

  if (manifest.coded_tools?.bundle) {
    const bundle = path.join(folder, manifest.coded_tools.bundle);
    try {
      const code = await readFile(bundle, "utf8");
      if (/^\s*import\s|\bimport\s*\(/m.test(code)) errors.push(`${manifest.coded_tools.bundle}: coded-tool bundles must be self-contained (no imports).`);
      manifest.coded_tools.integrity = sriDigest(code);
    } catch {
      errors.push(`missing coded-tool bundle ${manifest.coded_tools.bundle}`);
    }
  }
  outputs.set(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { outputs, errors };
}

export async function siteFolders(root = ROOT) {
  const config = JSON.parse(await readFile(path.join(root, "sites.config.json"), "utf8"));
  return [...config.sites.map((s) => path.join(root, s.folder)), path.join(root, "sites/spec-desk/handoff")];
}

async function main() {
  const check = process.argv.includes("--check");
  let failed = false;
  for (const folder of await siteFolders()) {
    const { outputs, errors, skipped } = await buildSite(folder);
    const rel = path.relative(ROOT, folder);
    if (skipped) { console.log(`[${rel}] no agent-manifest.json yet, skipped`); continue; }
    for (const e of errors) console.error(`[${rel}] ${e}`);
    if (errors.length) { failed = true; continue; }
    for (const [file, text] of outputs) {
      const current = await readFile(file, "utf8").catch(() => null);
      if (current === text) continue;
      if (check) {
        console.error(`[${rel}] ${path.relative(ROOT, file)} is out of date. Run npm run build:networks.`);
        failed = true;
      } else {
        await writeFile(file, text);
        console.log(`wrote ${path.relative(ROOT, file)}`);
      }
    }
    if (!errors.length) console.log(`[${rel}] ok`);
  }
  if (failed) process.exit(1);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) await main();
