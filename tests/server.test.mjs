import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { startServers, WORKER_CSP, isPublicArtifact } from "../server/serve.mjs";

let srv;
const logs = [];
before(async () => {
  srv = await startServers({ quiet: true, onLog: (e) => logs.push(e), ports: { "spec-desk": 0, "test-planner": 0, "risk-radar": 0 } });
});
after(() => srv.close());

function get(site, rawPath, headers = {}) {
  const s = srv.sites.find((x) => x.id === site);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: s.listen, port: s.port, path: rawPath, headers }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("public artifact classifier", () => {
  for (const p of ["/agent-manifest.json", "/links.json", "/x.network.json", "/x.hocon", "/tools/a.js", "/drills/cycle/agent-manifest.json", "/drills/cycle/x.network.json"]) assert.ok(isPublicArtifact(p), p);
  for (const p of ["/index.html", "/app.js", "/runtime/index.js", "/shared/tokens.css"]) assert.ok(!isPublicArtifact(p), p);
});

test("CORS on manifest, not on index.html", async () => {
  const m = await get("spec-desk", "/agent-manifest.json");
  assert.equal(m.headers["access-control-allow-origin"], "*");
  const i = await get("spec-desk", "/index.html");
  assert.equal(i.status, 200);
  assert.equal(i.headers["access-control-allow-origin"], undefined);
  assert.equal(i.headers["cache-control"], "no-store");
});

test("worker CSP on sandbox-worker.js", async () => {
  const r = await get("test-planner", "/runtime/sandbox-worker.js");
  assert.equal(r.status, 200);
  assert.equal(r.headers["content-security-policy"], WORKER_CSP);
  assert.match(r.headers["content-type"], /javascript/);
});

test("traversal refused", async () => {
  assert.equal((await get("spec-desk", "/../package.json")).status, 404);
  assert.equal((await get("spec-desk", "/%2e%2e/package.json")).status, 404);
  assert.equal((await get("spec-desk", "/runtime/../../package.json")).status, 404);
});

test("risk radar listens on IPv6 loopback", async () => {
  const r = await get("risk-radar", "/");
  assert.equal(r.status, 200);
  assert.match(r.body, /Risk Radar/);
});

test("log line has flags, not values", async () => {
  logs.length = 0;
  await get("test-planner", "/agent-manifest.json", { Origin: "http://127.0.0.1:5173", Cookie: "secret=abc", Authorization: "Bearer zzz" });
  const e = logs.at(-1);
  assert.equal(e.from, "http://127.0.0.1:5173");
  assert.equal(e.auth, "yes");
  assert.equal(e.cookies, "secret");
  assert.ok(!JSON.stringify(e).includes("zzz") && !JSON.stringify(e).includes("abc"));
});
