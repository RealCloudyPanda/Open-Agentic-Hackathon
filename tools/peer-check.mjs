#!/usr/bin/env node
// CLI: can this published agent network fill a link slot?
// Usage: node tools/peer-check.mjs <network URL> [--origin <caller origin>] [--slot <manifest URL>#<reference>] [--json]
import { parseArgs } from "node:util";
import { checkPeer } from "../shared/peer-check.js";
import * as runtime from "../vendor/nsdeploy-runtime/kernel.js";
import { parseHocon } from "../vendor/nsdeploy-runtime/hocon.js";

try {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { slot: { type: "string" }, origin: { type: "string" }, json: { type: "boolean" } },
  });
  if (positionals.length !== 1) throw new Error("Supply one network URL.");
  let contract = {};
  let callerOrigin = values.origin ? new URL(values.origin).origin : null;
  if (values.slot) {
    const manifestUrl = new URL(values.slot);
    const ref = manifestUrl.hash.slice(1);
    if (!ref) throw new Error("--slot requires a manifest URL followed by #<reference>.");
    manifestUrl.hash = "";
    const response = await fetch(manifestUrl, { credentials: "omit", redirect: "error" });
    if (!response.ok) throw new Error(`Slot manifest returned HTTP ${response.status}.`);
    const manifest = await response.json();
    contract = manifest.linking?.imports?.find((slot) => slot.reference === ref)?.["x-spec-relay-contract"];
    if (!contract) throw new Error(`No slot contract for '${ref}'.`);
    callerOrigin ??= manifestUrl.origin;
  }
  const read = async (url, options) => {
    const response = await fetch(url, {
      ...options,
      headers: callerOrigin ? { Origin: callerOrigin } : undefined,
    });
    if (response.ok && new URL(url).origin !== callerOrigin) {
      const allowed = response.headers.get("access-control-allow-origin");
      if (allowed !== "*" && (!callerOrigin || allowed !== callerOrigin)) {
        await response.body?.cancel();
        throw new Error(`CORS does not allow ${callerOrigin || "public access"}.`);
      }
    }
    return response;
  };
  const report = await checkPeer(positionals[0], { runtime: { ...runtime, parseHocon }, contract, fetch: read });
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else {
    for (const r of report.results) console.log(`${r.level.toUpperCase().padEnd(5)} ${String(r.n).padStart(2)}. ${r.name.padEnd(26)} ${r.detail}`);
    console.log(`\n${report.verdict}: ${report.url}`);
  }
  process.exitCode = report.ok ? 0 : 1;
} catch (error) {
  console.error(`${error.message}\nUsage: node tools/peer-check.mjs <network URL> [--origin <caller origin>] [--slot <manifest URL>#<reference>] [--json]`);
  process.exitCode = 2;
}
