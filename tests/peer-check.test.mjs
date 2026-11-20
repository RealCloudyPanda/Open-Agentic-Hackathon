import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkPeer, peerTarget } from "../shared/peer-check.js";
import { AgentNetwork, validateNetwork } from "../vendor/nsdeploy-runtime/kernel.js";
import { parseHocon } from "../vendor/nsdeploy-runtime/hocon.js";

const runtime = { AgentNetwork, validateNetwork, parseHocon };
const base = "https://planner.example/agents/";
const candidate = base + "risk_test_planner";
const fixture = (file) => readFile(new URL(`../sites/risk-radar/${file}`, import.meta.url), "utf8");

test("checks a nested planner with a trailing slash using credential-free requests", async () => {
  const seen = [];
  const report = await checkPeer(candidate + "/", {
    runtime,
    contract: { requires_sly_data: ["acceptance_criteria"] },
    fetch: async (url, options) => {
      assert.equal(options.credentials, "omit");
      assert.equal(options.redirect, "error");
      assert.ok(url.startsWith(base));
      const file = url.slice(base.length);
      seen.push(file);
      return new Response(await fixture(file));
    },
  });
  assert.equal(report.url, candidate);
  assert.equal(report.verdict, "Compatible");
  assert.deepEqual(seen, ["agent-manifest.json", "risk_test_planner.network.json", "links.json", "tools/risk-charter.js"]);
});

test("fails malformed manifests and off-origin definitions without a follow-up request", async () => {
  const manifest = JSON.parse(await fixture("agent-manifest.json"));
  manifest.networks[0].hocon = "https://different.example/definition.json";
  for (const body of [null, { networks: [null] }, manifest]) {
    const seen = [];
    const report = await checkPeer(candidate, {
      runtime,
      fetch: async (url) => { seen.push(url); return Response.json(body); },
    });
    assert.equal(report.ok, false);
    assert.deepEqual(seen, [base + "agent-manifest.json"]);
  }
});

test("rejects ambiguous planner URLs before any fetch", async () => {
  for (const url of ["https://user@planner.example/plan", "https://planner.example/plan?q=x", "https://planner.example/plan#other", "http://planner.example/plan", "https://planner.example/"]) {
    assert.throws(() => peerTarget(url));
    const fetch = () => assert.fail("invalid URLs must be rejected before fetch");
    assert.equal((await checkPeer(url, { fetch, runtime })).ok, false);
  }
});
