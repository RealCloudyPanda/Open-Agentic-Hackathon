import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { allowRule, ledgerRows, buildSlyData, findLeaks } from "../sites/spec-desk/relay/ledger.js";
import { saveBinding, readBinding, resetBinding, keyFor } from "../sites/spec-desk/relay/binding.js";

const net = JSON.parse(await readFile(new URL("../sites/spec-desk/spec_desk.network.json", import.meta.url), "utf8"));

test("ledger reads the allow rule from the network", () => {
  const allowed = allowRule(net);
  assert.deepEqual(allowed, ["acceptance_criteria", "feature_title", "platform"]);
  const rows = Object.fromEntries(ledgerRows(allowed, ["acceptance_criteria"], new Set(["platform"])).map((r) => [r.key, r]));
  assert.equal(rows.acceptance_criteria.state, "crosses");
  assert.equal(rows.acceptance_criteria.toggleable, false);
  assert.equal(rows.platform.state, "kept");
  assert.equal(rows.customer_name.state, "never");
  assert.equal(rows.internal_notes.toggleable, false);
});

test("unticked fields are omitted from slyData", () => {
  assert.deepEqual(Object.keys(buildSlyData({ a: "1", platform: "Web", b: "" }, new Set(["platform"]))), ["a"]);
});

test("leak guard", () => {
  assert.deepEqual(findLeaks("Plan for ACME docs please", { customer_name: "Acme Docs", internal_notes: "abc" }), ["customer_name"]);
  assert.deepEqual(findLeaks("Plan please", { customer_name: "Acme Docs" }), []);
});

test("binding never writes links.json and refuses non-slots", async () => {
  const file = new URL("../sites/spec-desk/links.json", import.meta.url);
  const before = createHash("sha256").update(await readFile(file)).digest("hex");
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  saveBinding(storage, "http://127.0.0.1:5173", "http://[::1]:5175/risk_test_planner", ["test_planner"]);
  assert.equal(readBinding(storage, "http://127.0.0.1:5173"), "http://[::1]:5175/risk_test_planner");
  assert.ok(mem.has(keyFor("http://127.0.0.1:5173")));
  assert.throws(() => saveBinding(storage, "http://127.0.0.1:5173", "http://x/y", ["other"]));
  resetBinding(storage, "http://127.0.0.1:5173");
  assert.equal(mem.size, 0);
  assert.equal(createHash("sha256").update(await readFile(file)).digest("hex"), before);
});
