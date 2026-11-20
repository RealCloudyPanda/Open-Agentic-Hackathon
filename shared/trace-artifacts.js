// Turn runtime trace events into the artifacts and the boundary receipt the page shows.
// Pure functions over trace.events; never reads values the runtime already redacted.

const PLANNER_TOOLS = ["PlanBuilder", "RiskProfiler", "CharterBuilder"];

export function artifactsFrom(events, { since = -1 } = {}) {
  const ev = events.filter((e) => (e.seq ?? 0) > since);
  const ends = (kind) => ev.filter((e) => e.kind === kind && e.phase === "end");
  const toolEnd = (name) => ends("tool_call").find((e) => e.tool === name && e.status === "ok");
  const drafter = toolEnd("CriteriaDrafter");
  const criteria = drafter ? { origin: drafter.origin, ...drafter.result } : null;

  let plan = null;
  const pb = toolEnd("PlanBuilder");
  const rp = toolEnd("RiskProfiler");
  const cb = toolEnd("CharterBuilder");
  if (pb) plan = { kind: "test_plan", origin: pb.origin, ...pb.result };
  else if (rp) plan = { kind: "risk_plan", origin: rp.origin, risks: rp.result.risks, received_fields: rp.result.received_fields, charters: cb?.result?.charters || [] };

  const fetches = ends("remote_fetch");
  const callStart = ev.find((e) => e.kind === "remote_call" && e.phase === "start");
  const callEnd = ends("remote_call")[0];
  const consent = ev.filter((e) => e.kind === "consent");
  const errors = ev.filter((e) => e.status === "error" && e.error).map((e) => e.error);
  const notes = ev.filter((e) => e.kind === "composition_limit" || e.kind === "composition_skip").map((e) => e.reason);
  const receipt = {
    contactedOrigins: [...new Set(fetches.filter((f) => f.status === "ok").map((f) => f.peerOrigin))],
    fetchedUrls: fetches.flatMap((f) => Object.values(f.fetchedUrls || {}).filter(Boolean)),
    validation: fetches.length ? (fetches.every((f) => f.status === "ok") ? "passed" : "failed") : "not reached",
    slyKeysSent: callStart ? Object.keys(callStart.requestPayload?.sly_data || {}).sort() : [],
    requestText: callStart?.requestPayload?.user_message?.text ?? null,
    peerNetwork: callStart?.network || null,
    declined: consent.some((c) => c.decision === "declined"),
    peerAnswered: !!callEnd && callEnd.status === "ok",
    errors,
    notes,
    authorizationSentToPeer: "no (plain fetch, no credentials)",
  };
  return { criteria, plan, receipt };
}

/** Deep copy of events with any sly_data values replaced (belt and braces). */
export function redactedTrace(events) {
  return JSON.parse(JSON.stringify(events, (k, v) => (k === "sly_data" && v && typeof v === "object" ? Object.fromEntries(Object.keys(v).map((x) => [x, "<redacted>"])) : v)));
}
