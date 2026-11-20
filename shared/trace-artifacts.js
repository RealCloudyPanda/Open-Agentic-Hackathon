// Turn runtime trace events into the artifacts and the boundary receipt the page shows.
// Pure functions over trace.events; never reads values the runtime already redacted.

export function artifactsFrom(events, { since = -1 } = {}) {
  const ev = events.filter((e) => (e.seq ?? 0) > since);
  const ends = (kind) => ev.filter((e) => e.kind === kind && e.phase === "end");
  const toolEnd = (name) => ends("tool_call").find((e) => e.tool === name && e.status === "ok");
  const drafter = toolEnd("CriteriaDrafter");
  const criteria = rows(drafter?.result?.criteria) ? { ...drafter.result, origin: drafter.origin } : null;

  let plan = null;
  const pb = toolEnd("PlanBuilder");
  const rp = toolEnd("RiskProfiler");
  const cb = toolEnd("CharterBuilder");
  if (rows(pb?.result?.plan?.cases) && Array.isArray(pb.result.plan.platform_notes)) {
    plan = { ...pb.result, kind: "test_plan", origin: pb.origin };
  } else if (rows(rp?.result?.risks) && rp.result.risks.every((row) => Array.isArray(row.criteria))) {
    plan = { kind: "risk_plan", origin: rp.origin, risks: rp.result.risks, received_fields: rp.result.received_fields, charters: rows(cb?.result?.charters) ? cb.result.charters : [] };
  }

  const fetches = ends("remote_fetch");
  const requests = ev.filter((e) => e.kind === "peer_artifact");
  const callStart = ev.find((e) => e.kind === "remote_call" && e.phase === "start");
  const callEnd = ends("remote_call")[0];
  const consent = ev.filter((e) => e.kind === "consent");
  const errors = ev.filter((e) => e.status === "error" && e.error).map((e) => e.error);
  const notes = ev.filter((e) => e.kind === "composition_limit" || e.kind === "composition_skip").map((e) => e.reason);
  const receipt = {
    contactedOrigins: [...new Set(requests.map((request) => request.peerOrigin))],
    fetchedUrls: [...new Set(requests.filter((request) => request.received).map((request) => request.url))],
    validation: fetches.length ? (fetches.every((f) => f.status === "ok") ? "passed" : "failed") : "not reached",
    slyKeysSent: callStart ? Object.keys(callStart.requestPayload?.sly_data || {}).sort() : [],
    requestText: callStart?.requestPayload?.user_message?.text ?? null,
    peerNetwork: callStart?.network || null,
    declined: consent.some((c) => c.decision === "declined"),
    peerAnswered: !!callEnd && callEnd.status === "ok",
    errors,
    notes,
    authorizationSentToPeer: "no (public artifact requests omit credentials)",
  };
  const peerAnswer = callEnd?.status === "ok" && callEnd.responsePreview
    ? { origin: callEnd.peerOrigin, text: callEnd.responsePreview }
    : null;
  return { criteria, plan, receipt, peerAnswer };
}

const rows = (value) => Array.isArray(value) && value.every((row) => row && typeof row === "object");

/** Deep copy of events with any sly_data values replaced (belt and braces). */
export function redactedTrace(events) {
  return JSON.parse(JSON.stringify(events, (k, v) => (k === "sly_data" && v && typeof v === "object" ? Object.fromEntries(Object.keys(v).map((x) => [x, "<redacted>"])) : v)));
}
