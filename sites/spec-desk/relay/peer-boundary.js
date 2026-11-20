import { fetchPeerArtifact, peerTarget, runtimeArtifactUrl } from "../../../shared/peer-check.js";

// The reference engine uses global fetch for peer artifacts. Scope those calls
// to the selected planner and the current turn without changing the runtime.
export function installPeerBoundary(engine, slot, transport = globalThis) {
  const fetch = transport.fetch.bind(transport);
  const runTurn = engine.runTurn.bind(engine);
  const resolveLink = engine.resolveLink.bind(engine);
  const resolveRemote = engine.resolveRemote.bind(engine);
  let active = false;

  // The page has already applied the effective binding. The stock resolver
  // would persist the publisher default and admit its origin before consent.
  engine.resolveLink = (reference, network, ...args) => {
    if (network === engine.top.network && reference === slot) return network.getLink(slot);
    return resolveLink(reference, network, ...args);
  };

  engine.resolveRemote = (ref, ...args) => {
    const selected = peerTarget(engine.top.network.getLink(slot)).url.href;
    if (ref !== selected) throw new Error("Only the selected planner network can be loaded in this turn.");
    return resolveRemote(ref, ...args);
  };

  engine.runTurn = async (...args) => {
    if (active) throw new Error("Wait for the current Spec Desk turn to finish.");
    const target = peerTarget(engine.top.network.getLink(slot));
    const ownOrigin = new URL(engine.top.base).origin;
    if (target.base.origin === ownOrigin) throw new Error("Choose a planner on a separate origin.");

    const manifestUrl = new URL("agent-manifest.json", target.base).href;
    const paths = new Set([manifestUrl, new URL("links.json", target.base).href]);
    const routerUrl = new URL(`${engine.top.llm.baseUrl}/chat/completions`);
    if (routerUrl.origin === target.base.origin) throw new Error("Choose a planner on a separate origin from your AI router.");
    const ask = engine.onConsent;
    let approved = false;
    engine.consent.clear();
    engine.registry = new engine.registry.constructor({ trace: engine.trace });
    engine.onConsent = async (info) => {
      if (info.kind !== "network" || info.peerOrigin !== target.url.host) return "decline";
      const decision = await ask?.(info);
      approved = decision === "allow" || decision === "always";
      return approved ? "allow" : "decline";
    };

    active = true;
    const original = transport.fetch;
    transport.fetch = async (input, options) => {
      const url = new URL(input instanceof Request ? input.url : input, engine.top.base);
      const method = options?.method || (input instanceof Request ? input.method : "GET");
      if ((method === "GET" && url.href === engine.top.bundleUrl) ||
          (method === "POST" && url.href === routerUrl.href)) {
        return fetch(input, { ...options, redirect: "error" });
      }
      if (!approved || method !== "GET" || !paths.has(url.href)) {
        throw new Error(`Contact with ${url.origin} was not approved for this request.`);
      }
      const response = await fetchPeerArtifact(fetch, target.base.origin, url.href, options).catch((error) => {
        engine.trace.note("peer_artifact", { peerOrigin: url.host, url: url.href, received: false });
        throw error;
      });
      engine.trace.note("peer_artifact", { peerOrigin: url.host, url: url.href, received: response.ok });
      if (response.ok && url.href === manifestUrl) {
        const manifest = await response.clone().json();
        const entry = manifest?.networks?.find((network) => network?.name === target.name);
        if (manifest?.actions) throw new Error("Planner action bridges are outside this slot's consent.");
        for (const file of [entry?.hocon, manifest?.coded_tools?.bundle].filter(Boolean)) {
          const asset = new URL(runtimeArtifactUrl(target.base, file));
          if (asset.origin !== target.base.origin || asset.username || asset.password) {
            throw new Error("Published artifacts must stay on the approved peer origin.");
          }
          paths.add(asset.href);
        }
      }
      return response;
    };
    try {
      return await runTurn(...args);
    } finally {
      transport.fetch = original;
      engine.onConsent = ask;
      active = false;
    }
  };
  return fetch;
}
