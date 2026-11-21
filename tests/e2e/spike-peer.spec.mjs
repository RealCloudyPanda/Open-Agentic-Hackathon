import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { startServers } from "../../server/serve.mjs";

let srv;
const logs = [];
test.beforeAll(async () => { srv = await startServers({ quiet: true, onLog: (e) => logs.push(e) }); });
test.afterAll(async () => { await srv?.close(); });

const peerLogs = () => logs.filter((e) => e.site === "test-planner");

async function run(page, decision) {
  logs.length = 0;
  let peerCountAtConsent = -1;
  let consentInfo = null;
  await page.exposeFunction("__decide", (info) => {
    consentInfo = info;
    peerCountAtConsent = peerLogs().length;
    return decision;
  });
  const fixture = JSON.parse(await readFile(new URL("../../sites/spec-desk/spec_desk.network.json", import.meta.url), "utf8"));
  fixture.tools[0].tools = ["criteria_writer", "test_planner"];
  await page.route("**/spec_desk.network.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(fixture) }));
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForSelector("body[data-ready='1']");
  const answer = await page.evaluate(async () => {
    const { engine } = window.__relay.booted;
    engine.onConsent = (info) => window.__decide({ peerOrigin: info.peerOrigin, requestText: info.requestText, kind: info.kind });
    await engine.runTurn("hello", { slyData: { acceptance_criteria: [] } });
    const ev = window.__relay.booted.trace.events;
    const call = ev.find((e) => e.kind === "remote_call" && e.phase === "end");
    const declined = ev.some((e) => e.kind === "consent" && e.decision === "declined");
    return { peerAnswer: call?.responsePreview || "", declined };
  });
  return { answer, consentInfo, peerCountAtConsent };
}

test("allow: consent precedes contact, then the peer's files load without credentials", async ({ page }) => {
  const { answer, consentInfo, peerCountAtConsent } = await run(page, "allow");
  expect(consentInfo.peerOrigin).toBe("localhost:5174");
  expect(peerCountAtConsent).toBe(0);
  const paths = peerLogs().map((e) => e.path);
  for (const p of ["/agent-manifest.json", "/test_planner.network.json", "/links.json"]) expect(paths).toContain(p);
  expect(peerLogs().every((e) => e.auth === "no" && e.cookies === "none")).toBe(true);
  expect(answer.peerAnswer).toContain("(mock summary)");
});

test("decline: zero requests to the peer", async ({ page }) => {
  const { answer } = await run(page, "decline");
  expect(peerLogs()).toHaveLength(0);
  expect(answer.declined).toBe(true);
});
