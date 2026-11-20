// Visitor binding for the test_planner slot. Stored in this browser only, in the runtime's
// own key format. It never writes links.json: the publisher default stays published.
import { peerTarget } from "../../../shared/peer-check.js";

export const SLOT = "test_planner";
export const keyFor = (base, network = "spec_desk", ref = SLOT) => `nsdeploy-link-v1::${base}::${network}::${ref}`;

export function readBinding(storage, base) {
  try {
    const stored = storage.getItem(keyFor(base));
    if (!stored) return "";
    const { url } = peerTarget(stored);
    return url.origin === new URL(base).origin ? "" : url.href;
  } catch { return ""; }
}

export function saveBinding(storage, base, url, slots = [SLOT]) {
  if (!slots.includes(SLOT)) throw new Error(`'${SLOT}' is not a declared link slot.`);
  storage.setItem(keyFor(base), peerTarget(url).url.href);
}

export function resetBinding(storage, base) {
  storage.removeItem(keyFor(base));
}

/** Re-apply after each load: the published links.json binding otherwise wins. */
export function applyBinding(engine, storage) {
  const net = engine.top.network;
  const stored = readBinding(storage, engine.top.base);
  const publisher = engine._publisherDefault ??= net.getLink(SLOT);
  const visitorChoice = !!stored && stored !== publisher;
  const target = visitorChoice ? stored : publisher;
  if (!net.linkSlots.has(SLOT)) throw new Error(`'${SLOT}' is not a declared link slot.`);
  if (engine._visitorPlannerOrigin) engine.runtimeAllowedPeers.delete(engine._visitorPlannerOrigin);
  net.setLink(SLOT, target);
  engine._visitorPlannerOrigin = visitorChoice ? new URL(stored).origin : null;
  if (engine._visitorPlannerOrigin) engine.runtimeAllowedPeers.add(engine._visitorPlannerOrigin);
  return { target, publisher, visitorChoice };
}
