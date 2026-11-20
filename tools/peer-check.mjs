#!/usr/bin/env node
// CLI: can this published agent network fill a link slot?
// Usage: node tools/peer-check.mjs <network URL> [--slot <manifest URL>#<reference>] [--json]
import { checkPeer } from "../shared/peer-check.js";
import * as runtime from "../vendor/nsdeploy-runtime/kernel.js";
import { parseHocon } from "../vendor/nsdeploy-runtime/hocon.js";

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--slot");
if (!url) { console.error("Usage: node tools/peer-check.mjs <network URL> [--slot <manifest URL>#<reference>] [--json]"); process.exit(2); }
let contract = {};
const slot = args[args.indexOf("--slot") + 1];
if (args.includes("--slot") && slot) {
  const [manifestUrl, ref] = slot.split("#");
  const m = await (await fetch(manifestUrl)).json();
  contract = (m.linking?.imports || []).find((i) => i.reference === ref)?.["x-spec-relay-contract"] || {};
}
const report = await checkPeer(url, { runtime: { ...runtime, parseHocon }, contract });
if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
else {
  for (const r of report.results) console.log(`${r.level.toUpperCase().padEnd(5)} ${String(r.n).padStart(2)}. ${r.name.padEnd(26)} ${r.detail}`);
  console.log(`\n${report.verdict}: ${url}`);
}
process.exit(report.ok ? 0 : 1);
