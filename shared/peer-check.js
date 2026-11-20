// Slot-contract compatibility checker: "can this published network fill my link slot?"
// Isomorphic: pass fetch and the vendored runtime's parseHocon/AgentNetwork/validateNetwork.
// Reads public files only; never runs peer code.

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export async function checkPeer(url, { fetch: f = globalThis.fetch, runtime, contract = {} } = {}) {
  const results = [];
  const add = (n, name, level, detail) => results.push({ n, name, level, detail });
  const done = () => {
    const fails = results.filter((r) => r.level === "fail").length;
    const warns = results.filter((r) => r.level === "warn").length;
    return { url, verdict: fails ? "Not compatible" : warns ? "Compatible with warnings" : "Compatible", ok: !fails, results };
  };

  let u;
  try { u = new URL(url); } catch { add(1, "Network URL", "fail", "Not a complete http(s) URL."); return done(); }
  const name = u.pathname.split("/").filter(Boolean).pop() || "";
  const httpsOk = u.protocol === "https:" || (u.protocol === "http:" && LOOPBACK.has(u.hostname));
  if (!name || !httpsOk) { add(1, "Network URL", "fail", !name ? "Last path segment must be the network name." : "Use https (http only on loopback)."); return done(); }
  add(1, "Network URL", "pass", `Network name '${name}'.`);
  const base = new URL("./", u).href.replace(/\/$/, "");

  let manifest;
  try {
    const r = await f(`${base}/agent-manifest.json`, { credentials: "omit" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    manifest = await r.json();
    add(2, "Manifest readable (CORS)", "pass", `${base}/agent-manifest.json`);
  } catch (e) { add(2, "Manifest readable (CORS)", "fail", `Could not read ${base}/agent-manifest.json: ${e.message}`); return done(); }

  const nets = Array.isArray(manifest.networks) ? manifest.networks : [];
  const shapeOk = nets.length && nets.every((n) => n.name && n.front_man && n.hocon) && manifest.llm_router;
  add(3, "Manifest shape", shapeOk ? (manifest.peer_policy ? "pass" : "warn") : "fail", shapeOk ? (manifest.peer_policy ? "networks, llm_router and peer policy present." : "No peer_policy.") : "networks[].name/front_man/hocon and llm_router are required.");
  const entry = nets.find((n) => n.name === name);
  if (!entry) { add(4, "Exact network name", "fail", `No published network named '${name}'. Published: ${nets.map((n) => n.name).join(", ") || "none"}.`); return done(); }
  add(4, "Exact network name", "pass", `'${name}' found; front agent '${entry.front_man}'.`);

  let net, config;
  try {
    const href = new URL(entry.hocon, `${base}/`).href;
    const r = await f(href, { credentials: "omit" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    if (/^\s*include\b/m.test(text) || /\$\{[^}]*\}/.test(text)) { add(6, "Data-only", "fail", "Includes or substitutions found."); return done(); }
    add(6, "Data-only", "pass", "No includes or substitutions.");
    config = runtime.parseHocon(text);
    net = new runtime.AgentNetwork(config, name);
    const v = runtime.validateNetwork(net);
    if (v.errors.length) { add(5, "Network validates", "fail", v.errors.join("; ")); return done(); }
    add(5, "Network validates", "pass", "Passes the reference validator.");
  } catch (e) { add(5, "Network validates", "fail", e.message); return done(); }

  const front = net.findFrontMan();
  const fspec = net.getAgentSpec(front) || {};
  const hasReq = fspec.function?.parameters?.properties?.request?.type === "string";
  add(7, "Front agent", front !== entry.front_man ? "fail" : fspec.function?.description && hasReq ? "pass" : "warn", `${front}${hasReq ? " takes a request string" : " has no request string input"}.`);

  try { const r = await f(`${base}/links.json`, { credentials: "omit" }); if (!r.ok) throw 0; await r.json(); add(8, "links.json", "pass", "Present and parseable."); }
  catch { add(8, "links.json", "warn", "Missing or unreadable."); }

  const reads = new Set((config.tools || []).flatMap((t) => t.allow?.to_downstream?.sly_data || []));
  const sends = contract.sends_sly_data || [];
  const required = contract.requires_sly_data || [];
  const missing = required.filter((k) => !reads.has(k));
  add(9, "Slot contract", missing.length ? "fail" : sends.every((k) => reads.has(k)) ? "pass" : "warn",
    `Reads ${sends.filter((k) => reads.has(k)).join(", ") || "none"} of ${sends.join(", ") || "nothing"}${missing.length ? `; required field(s) unread: ${missing.join(", ")}` : ""}.`);

  const ct = manifest.coded_tools;
  const usesCode = (config.tools || []).some((t) => t.class);
  add(10, "Coded tools", usesCode && !ct?.bundle ? "fail" : ct?.bundle && !/^sha(256|384|512)-/.test(ct.integrity || "") ? "warn" : "pass",
    ct?.bundle ? `${ct.bundle}${ct.integrity ? " with SRI digest" : " without SRI digest"}; runs in your sandboxed worker.` : "None.");
  add(11, "Its next hops", "info", (manifest.allowed_peers || []).length ? `May contact: ${manifest.allowed_peers.join(", ")} (you are asked again).` : "Calls no other sites.");
  add(12, "Model hint", "info", `${config.llm_config?.model_name || "none"}; it runs on your router regardless.`);
  return done();
}
