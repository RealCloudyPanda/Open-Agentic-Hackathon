import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { parseHocon } from "../vendor/nsdeploy-runtime/hocon.js";
import { AgentNetwork, validateNetwork } from "../vendor/nsdeploy-runtime/kernel.js";
import { buildSite, siteFolders, sriDigest } from "../scripts/build-networks.mjs";

const folders = [];
for (const f of await siteFolders()) {
  try { await access(path.join(f, "agent-manifest.json")); folders.push(f); } catch {}
}

for (const folder of folders) {
  const id = path.basename(folder);
  test(`${id}: published network passes the vendored validator`, async () => {
    const manifest = JSON.parse(await readFile(path.join(folder, "agent-manifest.json"), "utf8"));
    for (const entry of manifest.networks) {
      const text = await readFile(path.join(folder, entry.hocon), "utf8");
      const net = new AgentNetwork(parseHocon(text), entry.name);
      assert.deepEqual(validateNetwork(net).errors, []);
      assert.equal(net.findFrontMan(), entry.front_man);
    }
  });

  test(`${id}: build is clean and up to date`, async () => {
    const { outputs, errors } = await buildSite(folder);
    assert.deepEqual(errors, []);
    for (const [file, text] of outputs) assert.equal(await readFile(file, "utf8"), text, `${file} is stale`);
  });

  test(`${id}: integrity digest matches the bundle`, async () => {
    const manifest = JSON.parse(await readFile(path.join(folder, "agent-manifest.json"), "utf8"));
    if (!manifest.coded_tools) return;
    const code = await readFile(path.join(folder, manifest.coded_tools.bundle), "utf8");
    assert.equal(manifest.coded_tools.integrity, sriDigest(code));
  });
}
