import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { startServers } from "../../server/serve.mjs";

let srv;
test.beforeAll(async () => { srv = await startServers({ quiet: true }); });
test.afterAll(async () => { await srv?.close(); });

const SLY = { feature_request: "Add undo", feature_title: "Undo/redo", platform: "Web", customer_name: "Acme Docs", internal_notes: "Pilot may churn" };

async function relay(page) {
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForSelector("body[data-ready='1']");
  return page.evaluate(async (sly) => {
    const { engine, trace } = window.__relay.booted;
    engine.onConsent = async () => "allow";
    await engine.runTurn("Add undo", { slyData: sly });
    const ev = trace.events;
    const call = ev.find((e) => e.kind === "remote_call" && e.phase === "start");
    const peerTool = ev.find((e) => e.kind === "tool_call" && e.tool === "PlanBuilder" && e.phase === "end");
    return { sent: Object.keys(call?.requestPayload?.sly_data || {}).sort(), received: peerTool?.result?.received_fields, error: ev.filter((e) => e.status === "error").map((e) => e.error) };
  }, SLY);
}

const EXPECT = ["acceptance_criteria", "feature_title", "platform"];

test("nested drafter: only allowed keys cross, and the peer tool sees exactly them", async ({ page }) => {
  const r = await relay(page);
  expect(r.error).toEqual([]);
  expect(r.sent).toEqual(EXPECT);
  expect(r.received).toEqual(EXPECT);
});

test("flat drafter variant also works", async ({ page }) => {
  const net = JSON.parse(await readFile(new URL("../../sites/spec-desk/spec_desk.network.json", import.meta.url), "utf8"));
  net.tools[0].tools = ["criteria_drafter", "test_planner"];
  await page.route("**/spec_desk.network.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(net) }));
  const r = await relay(page);
  expect(r.sent).toEqual(EXPECT);
  expect(r.received).toEqual(EXPECT);
});
