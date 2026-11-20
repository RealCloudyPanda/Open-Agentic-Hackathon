// Visitor binding for the test_planner slot. Stored in this browser only, in the runtime's
// own key format. It never writes links.json: the publisher default stays published.

export const SLOT = "test_planner";
export const keyFor = (base, network = "spec_desk", ref = SLOT) => `nsdeploy-link-v1::${base}::${network}::${ref}`;

export function readBinding(storage, base) {
  try { return storage.getItem(keyFor(base)) || ""; } catch { return ""; }
}

export function saveBinding(storage, base, url, slots = [SLOT]) {
  if (!slots.includes(SLOT)) throw new Error(`'${SLOT}' is not a declared link slot.`);
  const u = new URL(url);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Use an http(s) network URL.");
  storage.setItem(keyFor(base), u.href.replace(/\/$/, ""));
}

export function resetBinding(storage, base) {
  storage.removeItem(keyFor(base));
}

/** Re-apply after each load: the published links.json binding otherwise wins. */
export function applyBinding(engine, storage) {
  const net = engine.top.network;
  const stored = readBinding(storage, engine.top.base);
  const publisher = engine._publisherDefault ??= net.getLink(SLOT);
  const target = stored || publisher;
  if (!net.linkSlots.has(SLOT)) throw new Error(`'${SLOT}' is not a declared link slot.`);
  net.setLink(SLOT, target);
  if (stored) engine.runtimeAllowedPeers.add(new URL(stored).origin);
  return { target, publisher, visitorChoice: !!stored };
}
