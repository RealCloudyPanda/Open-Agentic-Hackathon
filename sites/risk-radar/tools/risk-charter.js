const AREAS = [
  { area: "Edit history integrity", tags: ["undo", "redo"], words: /\b(undo|redo|revert|history)\b/i, impact: 3, likelihood: 2,
    tactic: "rapid undo/redo sequences interleaved with typing, paste and formatting", info: "edits that are lost, duplicated or restored in the wrong place" },
  { area: "Concurrent editing and merge", tags: ["collaboration", "sync"], words: /\b(collaborat\w*|concurrent|sync|shared|real-?time|merge)\b/i, impact: 3, likelihood: 3,
    tactic: "two or three clients editing the same paragraph with injected network delay", info: "divergent documents, dropped edits or another person's work being undone" },
  { area: "Offline and reconnect", tags: ["offline"], words: /\b(offline|reconnect|connection)\b/i, impact: 3, likelihood: 2,
    tactic: "toggling the network mid-edit and closing the tab before sync", info: "edits that never sync or sync twice" },
  { area: "Access control", tags: ["auth", "security"], words: /\b(sign|log ?in|password|auth\w*|permission)\b/i, impact: 3, likelihood: 2,
    tactic: "expired sessions, wrong roles and direct URLs", info: "data shown to or changed by the wrong person" },
  { area: "Input handling", tags: ["upload", "validation"], words: /\b(invalid|upload|file|input|reject\w*)\b/i, impact: 2, likelihood: 2,
    tactic: "empty, huge, malformed and pasted rich-text input", info: "crashes, silent truncation or unclear messages" },
  { area: "Accessibility", tags: ["accessibility"], words: /\b(keyboard|screen reader|accessib\w*|a11y)\b/i, impact: 2, likelihood: 2,
    tactic: "keyboard-only use and a screen reader on every control", info: "controls that cannot be reached, named or operated" },
  { area: "Search and output", tags: ["search", "export"], words: /\b(search|find|export|download)\b/i, impact: 2, likelihood: 1,
    tactic: "unusual characters, very large documents and empty results", info: "missing, wrong or slow results" },
  { area: "Notifications", tags: ["notifications"], words: /\b(notif\w*|alert|remind\w*)\b/i, impact: 1, likelihood: 2,
    tactic: "bursts of changes and muted or offline recipients", info: "missing, duplicate or noisy notifications" },
  { area: "Core flow and persistence", tags: ["happy-path", "persistence"], words: /\b(save|persist\w*|reload|main path)\b/i, impact: 2, likelihood: 1,
    tactic: "the main path with reloads and back/forward navigation", info: "results that do not stick" },
];

const GENERAL = { area: "General behaviour", impact: 1, likelihood: 1, tactic: "the feature's main path with unusual but valid data", info: "surprising behaviour worth a ticket" };

function str(v) {
  return typeof v === "string" ? v.trim() : "";
}

export function parseCriteriaText(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const tagged = lines
    .map((l) => /^[-*\d.)\s]*(AC-\d+)\s*[:.\-–]\s*(.+)$/i.exec(l))
    .filter(Boolean)
    .map((m) => ({ id: m[1].toUpperCase(), title: m[2].trim() }));
  if (tagged.length) return tagged;
  if (lines.length < 2) return lines.length ? [{ id: "AC-1", title: lines[0] }] : [];
  return lines.map((l, i) => ({ id: `AC-${i + 1}`, title: l.replace(/^[-*\d.)\s]+/, "") }));
}

function criteriaFrom(sly, request) {
  const shared = Array.isArray(sly && sly.acceptance_criteria) ? sly.acceptance_criteria.filter((c) => c && (c.title || c.then)) : [];
  if (shared.length) return { criteria: shared, source: "shared acceptance_criteria" };
  return { criteria: parseCriteriaText(request), source: "request text" };
}

function areaFor(c) {
  const tags = Array.isArray(c.tags) ? c.tags.map(String) : [];
  const text = `${str(c.title)} ${str(c.then)}`;
  return AREAS.find((a) => a.tags.some((t) => tags.includes(t))) || AREAS.find((a) => a.words.test(text)) || GENERAL;
}

function priority(score) {
  return score >= 6 ? "P1" : score >= 3 ? "P2" : "P3";
}

export function profileRisks(sly = {}, request = "") {
  const { criteria, source } = criteriaFrom(sly, request);
  const byArea = new Map();
  criteria.forEach((c, i) => {
    const a = areaFor(c);
    if (!byArea.has(a.area)) byArea.set(a.area, { def: a, criteria: [], dataLoss: false, order: i });
    const entry = byArea.get(a.area);
    entry.criteria.push(str(c.id) || `AC-${i + 1}`);
    if (Array.isArray(c.tags) && c.tags.includes("data-loss-risk")) entry.dataLoss = true;
  });
  const platform = str(sly.platform).toLowerCase();
  const risks = [...byArea.values()]
    .map((e) => {
      const impact = e.dataLoss ? 3 : e.def.impact;
      let likelihood = e.def.likelihood;
      if (/crdt|sync|real-?time/.test(platform) && e.def.area === "Concurrent editing and merge") likelihood = 3;
      return { area: e.def.area, impact, likelihood, score: impact * likelihood, criteria: e.criteria, order: e.order };
    })
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ order, ...r }, i) => ({ id: `R-${i + 1}`, ...r, priority: priority(r.score) }));
  return { risks, criteria_source: source };
}

export function buildCharters(risks) {
  const chosen = risks.filter((r) => r.score >= 3);
  if (!chosen.length && risks.length) chosen.push(risks[0]);
  return chosen.map((r, i) => {
    const def = AREAS.find((a) => a.area === r.area) || GENERAL;
    return {
      id: `CH-${i + 1}`,
      mission: `Explore ${r.area.toLowerCase()} with ${def.tactic} to discover ${def.info}.`,
      timebox_min: r.priority === "P1" ? 60 : r.priority === "P2" ? 45 : 30,
      priority: r.priority,
      risks: [r.id],
      criteria: r.criteria,
    };
  });
}

export class RiskProfiler {
  invoke(args, sly) {
    const received = Object.keys(sly || {}).sort();
    const { risks, criteria_source } = profileRisks(sly, args && args.request);
    sly.risk_profile = risks;
    return { risks, criteria_source, received_fields: received };
  }
}

export class CharterBuilder {
  invoke(args, sly) {
    const risks = Array.isArray(sly && sly.risk_profile) && sly.risk_profile.length
      ? sly.risk_profile
      : profileRisks(sly, args && args.request).risks;
    return { charters: buildCharters(risks) };
  }
}
