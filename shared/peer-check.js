// Slot-contract compatibility checker: "can this published network fill my link slot?"
// Isomorphic: pass fetch and the vendored runtime's parseHocon/AgentNetwork/validateNetwork.
// Reads public files only; never runs peer code.

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function peerTarget(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.has(url.hostname))) {
    throw new Error("Use HTTPS (HTTP only on loopback).");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Use a network URL without credentials, a query, or a fragment.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  const name = url.pathname.split("/").pop();
  if (!name) throw new Error("Last path segment must be the network name.");
  return { url, name, base: new URL("./", url) };
}

/** @param {RequestInit} [options] */
export async function fetchPeerArtifact(fetch, origin, href, options = {}) {
  const { cache, signal } = options;
  const url = new URL(href);
  if (url.origin !== origin || url.username || url.password) {
    throw new Error("Published artifacts must stay on the approved peer origin.");
  }
  return fetch(url.href, { cache, signal, credentials: "omit", redirect: "error" });
}

/** @param {{fetch?: typeof fetch, runtime?: any, contract?: {sends_sly_data?: string[], requires_sly_data?: string[]}}} [options] */
export async function checkPeer(url, options = {}) {
  const { fetch: f = globalThis.fetch, runtime, contract = {} } = options;
  const results = [];
  const add = (n, name, level, detail) => results.push({ n, name, level, detail });
  const done = () => {
    const fails = results.filter((r) => r.level === "fail").length;
    const warns = results.filter((r) => r.level === "warn").length;
    results.sort((a, b) => a.n - b.n);
    return { url, verdict: fails ? "Not compatible" : warns ? "Compatible with warnings" : "Compatible", ok: !fails, results };
  };

  let target;
  try { target = peerTarget(url); } catch (e) { add(1, "Network URL", "fail", e.message); return done(); }
  const { name, base } = target;
  url = target.url.href;
  const read = (href) => fetchPeerArtifact(f, base.origin, href);
  add(1, "Network URL", "pass", `Network name '${name}'.`);

  let manifest;
  const manifestUrl = new URL("agent-manifest.json", base).href;
  try {
    const r = await read(manifestUrl);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    manifest = await r.json();
    add(2, "Manifest readable (CORS)", "pass", manifestUrl);
  } catch (e) { add(2, "Manifest readable (CORS)", "fail", `Could not read ${manifestUrl}: ${e.message}`); return done(); }

  const nets = Array.isArray(manifest?.networks) ? manifest.networks : [];
  const shapeOk = nets.length && nets.every((n) => ["name", "front_man", "hocon"].every((key) => typeof n?.[key] === "string" && n[key]))
    && new Set(nets.map((n) => n.name)).size === nets.length
    && typeof manifest.llm_router?.base_url === "string"
    && ["open", "closed"].includes(manifest.peer_policy?.mode)
    && Array.isArray(manifest.allowed_peers) && manifest.allowed_peers.every((origin) => typeof origin === "string");
  add(3, "Manifest shape", shapeOk && !manifest.actions ? "pass" : "fail",
    !shapeOk ? "Expected unique networks with name/front_man/hocon, a router and peer policy."
      : manifest.actions ? "Planner action bridges are outside this slot's consent." : "Networks, router and peer policy present.");
  if (!shapeOk || manifest.actions) return done();
  const entry = nets.find((n) => n.name === name);
  if (!entry) { add(4, "Exact network name", "fail", `No published network named '${name}'. Published: ${nets.map((n) => n.name).join(", ") || "none"}.`); return done(); }
  add(4, "Exact network name", "pass", `'${name}' found; front agent '${entry.front_man}'.`);

  let net, config;
  try {
    const r = await read(runtimeArtifactUrl(base, entry.hocon));
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

  try {
    const r = await read(new URL("links.json", base).href);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const links = await r.json();
    if (links?.version !== 1 || !isRecord(links.networks) ||
        !Object.values(links.networks).every((bindings) => isRecord(bindings) && Object.values(bindings).every((value) => typeof value === "string"))) {
      throw new Error("Expected a version 1 network binding map.");
    }
    add(8, "links.json", "pass", "Present with a version 1 binding map.");
  } catch (e) { add(8, "links.json", "warn", e.message); }

  const reads = new Set((config.tools || []).flatMap((t) => t.allow?.to_downstream?.sly_data || []));
  const sends = contract.sends_sly_data || [];
  const required = contract.requires_sly_data || [];
  const missing = required.filter((k) => !reads.has(k));
  add(9, "Slot contract", missing.length ? "fail" : sends.every((k) => reads.has(k)) ? "pass" : "warn",
    `Reads ${sends.filter((k) => reads.has(k)).join(", ") || "none"} of ${sends.join(", ") || "nothing"}${missing.length ? `; required field(s) unread: ${missing.join(", ")}` : ""}.`);

  const ct = manifest.coded_tools;
  const usesCode = (config.tools || []).some((t) => t.class);
  try {
    if (usesCode && !ct?.bundle) throw new Error("The network needs a coded-tool bundle.");
    if (ct?.bundle) {
      const bundle = await read(runtimeArtifactUrl(base, ct.bundle));
      if (!bundle.ok) throw new Error(`Bundle HTTP ${bundle.status}`);
      await bundle.body?.cancel();
    }
    const hasDigest = /^sha(256|384|512)-[A-Za-z0-9+/]+=*$/.test(ct?.integrity || "");
    add(10, "Coded tools", ct?.bundle && !hasDigest ? "warn" : "pass",
      ct?.bundle ? `${ct.bundle} is readable${hasDigest ? " and declares an SRI digest" : " but lacks a supported SRI digest"}.` : "None.");
  } catch (e) { add(10, "Coded tools", "fail", e.message); }
  add(11, "Its next hops", "info", (manifest.allowed_peers || []).length ? `May contact: ${manifest.allowed_peers.join(", ")} (you are asked again).` : "Calls no other sites.");
  add(12, "Model hint", "info", `${config.llm_config?.model_name || "none"}; it runs on your router regardless.`);
  return done();
}

const isRecord = (value) => value && typeof value === "object" && !Array.isArray(value);

// Match the reference runtime's prefixing of paths relative to a nested site base.
export function runtimeArtifactUrl(base, file) {
  if (typeof file !== "string") throw new Error("Artifact path must be a string.");
  return /^https?:\/\//i.test(file) ? file : base.href + file.replace(/^\//, "");
}
