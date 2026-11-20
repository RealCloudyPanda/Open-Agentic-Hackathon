import { test, expect } from "@playwright/test";
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
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForSelector("body[data-ready='1']");
  const answer = await page.evaluate(async () => {
    const { engine } = window.__spike;
    engine.onConsent = (info) => window.__decide({ peerOrigin: info.peerOrigin, requestText: info.requestText, kind: info.kind });
    const r = await engine.runTurn("hello", { slyData: { acceptance_criteria: [] } });
    return r.text;
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
  expect(answer).toContain("(mock");
  expect(answer).toContain("I have no grounded tool output"); // the peer helper's mock text, relayed back
});

test("decline: zero requests to the peer", async ({ page }) => {
  const { answer } = await run(page, "decline");
  expect(peerLogs()).toHaveLength(0);
  expect(answer).toContain("declined");
});
