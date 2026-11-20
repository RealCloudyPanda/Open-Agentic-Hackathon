// Handoff ledger: which intake fields cross to the planner, computed from the loaded
// network's own allow rule (not hard-coded) and the visitor's choices.

export const FIELDS = [
  { key: "acceptance_criteria", label: "Acceptance criteria", generated: true },
  { key: "feature_title", label: "Feature title" },
  { key: "platform", label: "Platform" },
  { key: "customer_name", label: "Customer", private: true },
  { key: "internal_notes", label: "Internal notes", private: true },
  { key: "feature_request", label: "Feature request", private: true, note: "May appear in the request text shown on the consent card." },
];

export function allowRule(networkConfig) {
  const tools = networkConfig?.tools || [];
  const front = tools.find((t) => t.instructions && !t.class && !t.toolbox) || {};
  return front.allow?.to_downstream?.sly_data || [];
}

/** rows: [{key,label,state:"crosses"|"kept"|"never", toggleable, reason}] */
export function ledgerRows(allowed, required = ["acceptance_criteria"], unticked = new Set()) {
  return FIELDS.map((f) => {
    const inRule = allowed.includes(f.key) || allowed.includes("*");
    const req = required.includes(f.key);
    if (!inRule) return { ...f, state: "never", toggleable: false, reason: f.note || "Not in Spec Desk's published allow rule." };
    if (req) return { ...f, state: "crosses", toggleable: false, reason: "Required by the planner slot; generated from your intake." };
    if (unticked.has(f.key)) return { ...f, state: "kept", toggleable: true, reason: "You unticked it." };
    return { ...f, state: "crosses", toggleable: true, reason: "In the allow rule. Untick to keep it here." };
  });
}

/** All local fields minus the ones the visitor unticked. */
export function buildSlyData(intake, unticked = new Set()) {
  const out = {};
  for (const [k, v] of Object.entries(intake)) if (!unticked.has(k) && v !== "") out[k] = v;
  return out;
}

/** Match short values as whole words and longer values as literal text. */
export function findLeaks(requestText, withheld) {
  const text = String(requestText || "").toLowerCase();
  return Object.entries(withheld)
    .filter(([, v]) => {
      if (typeof v !== "string" || !v.trim()) return false;
      const value = v.trim().toLowerCase();
      if (value.length >= 4) return text.includes(value);
      const literal = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?<![\\p{L}\\p{N}])${literal}(?![\\p{L}\\p{N}])`, "u").test(text);
    })
    .map(([k]) => k);
}
