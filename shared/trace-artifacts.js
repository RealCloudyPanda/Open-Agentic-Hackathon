export function artifactsFrom(events, { since = -1, localOrigin = "" } = {}) {
  const ev = events.filter((e) => (e.seq ?? 0) > since);
  const ends = (kind) => ev.filter((e) => e.kind === kind && e.phase === "end");

  const results = ends("tool_call").filter((e) => e.status === "ok" && e.result && typeof e.result === "object");
  const drafter = results.find((e) => (!localOrigin || e.origin === localOrigin) && rows(e.result.criteria));
  const criteria = drafter ? { ...drafter.result, origin: drafter.origin } : null;
  let plan = null;
  const pb = results.find((e) => rows(e.result.plan?.cases) && Array.isArray(e.result.plan.platform_notes));
  const rp = results.find((e) => rows(e.result.risks) && e.result.risks.every((r) => Array.isArray(r.criteria)));
  if (pb) plan = { ...pb.result, kind: "test_plan", origin: pb.origin };
  else if (rp) {
    const cb = results.find((e) => e.origin === rp.origin && rows(e.result.charters));
    plan = { kind: "risk_plan", origin: rp.origin, risks: rp.result.risks, criteria_source: rp.result.criteria_source, received_fields: rp.result.received_fields, charters: cb?.result.charters ?? [] };
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

export function redactedTrace(events) {
  return JSON.parse(JSON.stringify(events, (k, v) => (k === "sly_data" && v && typeof v === "object" ? Object.fromEntries(Object.keys(v).map((x) => [x, "<redacted>"])) : v)));
}
