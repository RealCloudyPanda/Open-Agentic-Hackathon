// Spec Desk coded tool: CriteriaDrafter.
// Turns a feature request into 4–9 Given/When/Then acceptance criteria, deterministically.
// Self-contained (no imports): the runtime runs it in a sandboxed worker with no network.
//
// Reads sly_data: feature_request, feature_title, platform, internal_notes.
// Writes sly_data: acceptance_criteria.
// internal_notes may raise priority and add a risk tag, but its text is never copied.

const LIBRARY = [
  {
    topic: "undo",
    match: /\b(undo|redo|revert)\b/i,
    items: [
      { key: "undo-last", title: "Undo reverts my most recent edit", given: "I have made at least one edit to the document", when: "I choose Undo ({undoKey})", then: "my most recent edit is reverted and the document shows its previous state", tags: ["undo"] },
      { key: "redo", title: "Redo reapplies an edit I undid", given: "I have just undone an edit", when: "I choose Redo ({redoKey})", then: "the undone edit is applied again exactly as before", tags: ["redo"] },
      { key: "own-edits", title: "Undo reverts only my own edits", given: "another collaborator has edited the same document after my last edit", when: "I choose Undo", then: "only my own edits are reverted and the other collaborator's edits stay in place", tags: ["undo", "collaboration"] },
      { key: "redo-cleared", title: "A new edit clears the redo history", given: "I have undone an edit", when: "I make a new edit", then: "Redo is unavailable and the undone edit cannot be reapplied", tags: ["redo"] },
    ],
  },
  {
    topic: "collaboration",
    match: /\b(collaborat\w*|shared|real-?time|multiplayer|co-?edit\w*|crdt)\b/i,
    items: [
      { key: "concurrent", title: "Concurrent edits converge for everyone", given: "two collaborators edit the same paragraph at the same time", when: "both edits sync", then: "every collaborator sees the same final text and no edit is silently dropped", tags: ["collaboration", "sync"] },
      { key: "presence", title: "Remote changes appear without a reload", given: "a collaborator changes the document", when: "the change syncs", then: "I see it within a few seconds without reloading the page", tags: ["collaboration"] },
    ],
  },
  {
    topic: "search",
    match: /\b(search|find|filter|query)\b/i,
    items: [
      { key: "search-hit", title: "Search returns matching results", given: "content containing a known term exists", when: "I search for that term", then: "matching results are listed with the term highlighted", tags: ["search"] },
      { key: "search-empty", title: "Search with no matches says so", given: "no content contains the term", when: "I search for it", then: "an empty state explains that nothing matched and suggests a broader search", tags: ["search"] },
    ],
  },
  {
    topic: "export",
    match: /\b(export|download|csv|pdf)\b/i,
    items: [
      { key: "export-ok", title: "Export produces a complete file", given: "a document with formatted content", when: "I export it", then: "the file contains all content and its formatting", tags: ["export"] },
      { key: "export-large", title: "Large exports do not block the page", given: "a very large document", when: "I export it", then: "progress is shown and I can keep working until the file is ready", tags: ["export", "performance"] },
    ],
  },
  {
    topic: "auth",
    match: /\b(log ?in|sign ?in|auth\w*|password|sso|2fa|mfa)\b/i,
    items: [
      { key: "auth-ok", title: "Valid credentials sign me in", given: "I have an account", when: "I sign in with valid credentials", then: "I land on my workspace and stay signed in across reloads", tags: ["auth"] },
      { key: "auth-bad", title: "Invalid credentials are refused safely", given: "I enter a wrong password", when: "I submit the form", then: "I see a generic error that does not reveal whether the account exists", tags: ["auth", "security"] },
    ],
  },
  {
    topic: "upload",
    match: /\b(upload|attach\w*|file|image)s?\b/i,
    items: [
      { key: "upload-ok", title: "Supported files upload", given: "a supported file under the size limit", when: "I upload it", then: "it appears in place with a preview", tags: ["upload"] },
      { key: "upload-bad", title: "Unsupported or oversized files are refused", given: "a file that is too large or of an unsupported type", when: "I try to upload it", then: "it is refused with a message naming the limit", tags: ["upload", "validation"] },
    ],
  },
  {
    topic: "offline",
    match: /\b(offline|no connection|network loss|airplane)\b/i,
    items: [
      { key: "offline-edit", title: "Edits made offline are kept", given: "I lose my connection while editing", when: "I keep editing and then reconnect", then: "my offline edits sync and nothing is lost", tags: ["offline", "sync"] },
    ],
  },
  {
    topic: "notifications",
    match: /\b(notif\w*|alert|email me|remind\w*)\b/i,
    items: [
      { key: "notify", title: "I am notified of relevant changes", given: "I follow a document", when: "someone changes it", then: "I receive one notification that links to the change", tags: ["notifications"] },
    ],
  },
];

const GENERIC = [
  { key: "happy", title: "The main path works end to end", given: "a signed-in user on {feature}", when: "they complete the main task", then: "the result is saved and confirmed on screen", tags: ["happy-path"] },
  { key: "invalid", title: "Invalid input is rejected with a clear message", given: "a user on {feature}", when: "they give input the feature cannot accept", then: "nothing changes and a message explains what to fix", tags: ["validation"] },
  { key: "a11y", title: "It works by keyboard and screen reader", given: "a user who uses only a keyboard and a screen reader", when: "they use {feature}", then: "every control is reachable, labelled and announced", tags: ["accessibility"] },
  { key: "persist", title: "Results persist after a reload", given: "a user who has just used {feature}", when: "they reload the page", then: "the result is still there", tags: ["persistence"] },
];

// Words in internal notes that raise the risk of data loss. Only the flag is used.
const DATA_LOSS = /\b(lost|lose|losing|loss|churn\w*|overwrit\w*|corrupt\w*|deleted)\b/i;

const MAX = 9;

function asText(v) {
  return typeof v === "string" ? v : "";
}

function shortcuts(platform) {
  const p = platform.toLowerCase();
  if (/\b(ios|android|mobile)\b/.test(p)) return { undoKey: "tap Undo", redoKey: "tap Redo" };
  if (/\bmac\b/.test(p)) return { undoKey: "Cmd+Z", redoKey: "Cmd+Shift+Z" };
  return { undoKey: "Ctrl+Z or Cmd+Z", redoKey: "Ctrl+Shift+Z or Cmd+Shift+Z" };
}

function fill(text, vars) {
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

/** Pure function: same input, same output. */
export function draftCriteria({ feature_request, feature_title, platform, internal_notes, request } = {}) {
  const featureText = asText(feature_request) || asText(request);
  const title = asText(feature_title).trim();
  const plat = asText(platform).trim();
  const dataLossRisk = DATA_LOSS.test(asText(internal_notes));
  const vars = { ...shortcuts(plat), feature: title ? `the ${title} feature` : "the feature" };

  const picked = [];
  const topics = [];
  for (const group of LIBRARY) {
    if (group.match.test(featureText) || group.match.test(title)) {
      topics.push(group.topic);
      picked.push(...group.items);
    }
  }
  // Topic criteria first (at most 7), then generic ones until there are at most 9.
  const specific = picked.slice(0, MAX - 2);
  const chosen = [...specific, ...GENERIC.slice(0, MAX - specific.length)];

  const criteria = chosen.map((c, i) => {
    const tags = [...c.tags];
    const core = !c.tags.some((t) => ["happy-path", "validation", "accessibility", "persistence"].includes(t));
    let priority = core ? "P2" : "P3";
    if (c.key === "happy" || c.key === "undo-last" || c.key === "own-edits") priority = "P1";
    if (dataLossRisk && (tags.includes("undo") || tags.includes("sync") || tags.includes("collaboration") || c.key === "persist")) {
      tags.push("data-loss-risk");
      priority = "P1";
    }
    return {
      id: `AC-${i + 1}`,
      title: fill(c.title, vars),
      given: fill(c.given, vars),
      when: fill(c.when, vars),
      then: fill(c.then, vars),
      tags,
      priority,
    };
  });

  return {
    feature_title: title || null,
    platform: plat || null,
    topics: topics.length ? topics : ["generic"],
    criteria,
    open_questions: [
      topics.includes("undo") ? "How many steps of undo history should be kept?" : "What is out of scope for the first release?",
      plat ? `Which ${plat} versions must be supported?` : "Which platforms must be supported?",
    ],
  };
}

export class CriteriaDrafter {
  invoke(args, sly) {
    const out = draftCriteria({ ...(sly || {}), request: args && args.request });
    sly.acceptance_criteria = out.criteria;
    return out;
  }
}
