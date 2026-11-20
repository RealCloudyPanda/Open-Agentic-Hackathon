import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Engine } from "../vendor/nsdeploy-runtime/engine.js";
import { artifactsFrom } from "../shared/trace-artifacts.js";
import { applyBinding, keyFor, saveBinding, resetBinding, SLOT } from "../sites/spec-desk/relay/binding.js";
import { installPeerBoundary } from "../sites/spec-desk/relay/peer-boundary.js";

const desk = "http://127.0.0.1:5173";
const planner = "http://localhost:5174";
const radar = "http://[::1]:5175";
const sites = new Map([[desk, "spec-desk"], [planner, "test-planner"], [radar, "risk-radar"]]);

async function fixtureEngine(t, change = (text) => text) {
  const reads = [];
  t.mock.method(globalThis, "fetch", async (input, options) => {
    const url = new URL(input);
    const folder = sites.get(url.origin);
    assert.ok(folder, `Unexpected fetch: ${url.href}`);
    reads.push({ url, options });
    const file = new URL(`../sites/${folder}${url.pathname}`, import.meta.url);
    return new Response(change(await readFile(file, "utf8"), url));
  });
  const entries = new Map();
  const storage = {
    getItem: (key) => entries.get(key),
    setItem: (key, url) => entries.set(key, url),
    removeItem: (key) => entries.delete(key),
  };
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  t.after(() => {
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else delete globalThis.localStorage;
  });
  const engine = new Engine({ originUrl: desk });
  await engine.loadTop();
  applyBinding(engine, storage);
  installPeerBoundary(engine, SLOT);
  // Substitute for the unavailable browser Worker. The real sandbox still reads
  // and integrity-checks the committed bundles before the fixture tool runs.
  engine.sandbox.invoke = async ({ bundleUrl, integrity, className, args, permittedSly, origin }) => {
    const source = await engine.sandbox._bundleSource(bundleUrl, integrity);
    const bundle = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
    const result = await new bundle[className]().invoke(args, permittedSly);
    const span = engine.trace.start("tool_call", { tool: className, origin });
    engine.trace.end(span, { result });
    return { result, slyData: permittedSly };
  };
  return { engine, storage, reads };
}

test("requires fresh consent, applies the slot allowlist, and keeps the publisher default separate", async (t) => {
  const { engine, storage, reads } = await fixtureEngine(t);
  const input = "Add undo";
  const slyData = { feature_request: input, feature_title: "Undo", customer_name: "A customer", internal_notes: "Private notes" };
  const peerReads = () => reads.filter(({ url }) => url.origin !== desk);
  engine.onConsent = (info) => {
    assert.equal(info.peerOrigin, "localhost:5174");
    assert.deepEqual(peerReads(), []);
    return "decline";
  };
  await engine.runTurn(input, { slyData });
  assert.deepEqual(peerReads(), []);
  assert.equal(storage.getItem(keyFor(desk)), undefined);
  assert.equal(engine.runtimeAllowedPeers.has(planner), false);

  engine.resetHistory();
  engine.onConsent = () => "allow";
  const since = engine.trace.events.at(-1).seq;
  await engine.runTurn(input, { slyData });
  const { plan, receipt } = artifactsFrom(engine.trace.events, { since });
  assert.deepEqual(receipt.slyKeysSent, ["acceptance_criteria", "feature_title"]);
  assert.deepEqual(plan.received_fields, receipt.slyKeysSent);
  assert.deepEqual(receipt.fetchedUrls, peerReads().map(({ url }) => url.href));
  assert.equal(receipt.fetchedUrls.length, 4);
  assert.ok(peerReads().every(({ options }) => options.credentials === "omit" && options.redirect === "error"));

  saveBinding(storage, desk, radar + "/risk_test_planner/");
  applyBinding(engine, storage);
  engine.resetHistory();
  engine.onConsent = (info) => {
    assert.equal(info.peerOrigin, "[::1]:5175");
    assert.ok(!peerReads().some(({ url }) => url.origin === radar));
    return "allow";
  };
  const beforeSwap = engine.trace.events.at(-1).seq;
  await engine.runTurn(input, { slyData });
  assert.equal(artifactsFrom(engine.trace.events, { since: beforeSwap }).plan.kind, "risk_plan");
  resetBinding(storage, desk);
  assert.equal(applyBinding(engine, storage).target, planner + "/test_planner");
  assert.equal(engine.runtimeAllowedPeers.has(radar), false);
});

test("rejects an off-origin artifact introduced after a planner was selected", async (t) => {
  const { engine, reads } = await fixtureEngine(t, (text, url) => {
    if (url.href !== planner + "/agent-manifest.json") return text;
    const manifest = JSON.parse(text);
    manifest.coded_tools.bundle = "https://unapproved.example/tool.js";
    return JSON.stringify(manifest);
  });
  engine.onConsent = () => "allow";
  await engine.runTurn("Add undo");
  const { receipt } = artifactsFrom(engine.trace.events);
  assert.equal(receipt.validation, "failed");
  assert.deepEqual(receipt.fetchedUrls, [planner + "/agent-manifest.json"]);
  assert.match(receipt.errors.join(" "), /approved peer origin/);
  assert.deepEqual(reads.filter(({ url }) => url.origin !== desk).map(({ url }) => url.href), receipt.fetchedUrls);
});
