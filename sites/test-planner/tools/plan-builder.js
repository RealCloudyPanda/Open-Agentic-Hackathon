// Test Planner coded tool: PlanBuilder.
// Turns acceptance criteria into a case-by-case test matrix, deterministically.
// Self-contained (no imports): runs in the caller's sandboxed worker with no network.
//
// Reads sly_data: acceptance_criteria, feature_title, platform (only what the caller's
// allow rule and this tool's allow rule both name). Falls back to parsing
// "AC-1: ..." lines from the request text, so it also works standalone.

const LEVEL_BY_TAG = [
  [["collaboration", "sync", "offline"], "integration"],
  [["accessibility", "happy-path", "persistence", "notifications"], "e2e"],
  [["validation", "security", "auth"], "unit"],
];

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function str(v) {
  return typeof v === "string" ? v.trim() : "";
}

/** Parse criteria from free text: "AC-1: title" lines, else one criterion per line. */
export function parseCriteriaText(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const tagged = lines
    .map((l) => /^[-*\d.)\s]*(AC-\d+)\s*[:.\-–]\s*(.+)$/i.exec(l))
    .filter(Boolean)
    .map((m) => ({ id: m[1].toUpperCase(), title: m[2].trim() }));
  if (tagged.length) return tagged;
  if (lines.length < 2) return lines.length ? [{ id: "AC-1", title: lines[0].replace(/^[-*\d.)\s]+/, "") }] : [];
  return lines.map((l, i) => ({ id: `AC-${i + 1}`, title: l.replace(/^[-*\d.)\s]+/, "") }));
}

function levelFor(tags) {
  for (const [names, level] of LEVEL_BY_TAG) if (tags.some((t) => names.includes(t))) return level;
  return "integration";
}

function lowerFirst(s) {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

function casesFor(c, n) {
  const tags = asArray(c.tags).map(String);
  const base = /^P[123]$/.test(c.priority) ? c.priority : "P2";
  const bump = (p) => (p === "P1" ? "P2" : "P3");
  const level = levelFor(tags);
  const given = str(c.given) || "the feature is available";
  const when = str(c.when) || `the user exercises: ${lowerFirst(c.title)}`;
  const then = str(c.then) || lowerFirst(c.title);
  const risky = tags.includes("data-loss-risk");
  return [
    {
      id: `TC-${n}.1`, criterion: c.id, type: "positive", level, priority: base,
      title: `Confirm: ${c.title}`,
      steps: [`Set up: ${given}.`, `Act: ${when}.`, "Observe the result."],
      expected: `${then[0].toUpperCase()}${then.slice(1)}.`,
    },
    {
      id: `TC-${n}.2`, criterion: c.id, type: "negative", level: level === "e2e" ? "integration" : level, priority: risky ? "P1" : bump(base),
      title: `Refuse or recover: ${c.title}`,
      steps: [`Set up: ${given}, then break a precondition (missing data, lost connection or no permission).`, `Act: ${when}.`, "Observe the message and the stored state."],
      expected: "Nothing is lost or half-applied, and a clear message says what happened.",
    },
    {
      id: `TC-${n}.3`, criterion: c.id, type: "edge", level: "e2e", priority: risky ? "P1" : bump(base),
      title: `Boundary: ${c.title}`,
      steps: [`Set up: ${given}, at the limit (empty, very large, or repeated quickly).`, `Act: ${when} several times in a row.`, "Reload and observe."],
      expected: "Behaviour stays correct and consistent after the reload.",
    },
  ];
}

function platformNotes(platform) {
  const p = platform.toLowerCase();
  const notes = [];
  if (!p) return ["No platform was shared; run the e2e cases on your main supported browser and device."];
  if (/web|react|browser/.test(p)) notes.push("Run e2e cases in Chromium, Firefox and WebKit; check keyboard shortcuts on Windows and macOS.");
  if (/crdt|sync|real-?time/.test(p)) notes.push("Run integration cases with two clients and injected network delay to exercise merge order.");
  if (/ios|android|mobile/.test(p)) notes.push("Run e2e cases on one small and one large device, with the app backgrounded mid-step.");
  if (!notes.length) notes.push(`Run e2e cases on ${platform}.`);
  return notes;
}

/** Pure function: same input, same output. */
export function buildPlan(sly = {}, request = "") {
  const received = Object.keys(sly || {}).sort();
  let criteria = asArray(sly.acceptance_criteria).filter((c) => c && (c.title || c.then));
  let source = "shared acceptance_criteria";
  if (!criteria.length) {
    criteria = parseCriteriaText(request);
    source = "request text";
  }
  criteria = criteria.map((c, i) => ({ ...c, id: str(c.id) || `AC-${i + 1}`, title: str(c.title) || str(c.then) }));
  const cases = [];
  const coverage = {};
  criteria.forEach((c, i) => {
    const cs = casesFor(c, i + 1);
    cases.push(...cs);
    coverage[c.id] = cs.map((x) => x.id);
  });
  return {
    feature_title: str(sly.feature_title) || null,
    criteria_source: source,
    plan: { cases, coverage, platform_notes: platformNotes(str(sly.platform)) },
    received_fields: received,
  };
}

export class PlanBuilder {
  invoke(args, sly) {
    return buildPlan(sly, args && args.request);
  }
}
