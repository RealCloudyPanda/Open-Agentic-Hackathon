import { redactedTrace } from "/shared/trace-artifacts.js";
import { esc, stamp } from "./html.js";

export function criteriaCard(c) {
  return `<article class="card art enter" aria-label="Acceptance criteria">
    <header><h3>Acceptance criteria</h3>${stamp(c.origin, " · Spec Desk")}</header>
    <p>Suggested checks require review before handoff.</p>
    ${(c.requirements || []).map((r) => `<p><b>${esc(r.id)}</b> · Explicit requirement: ${esc(r.text)} <small>feature_request [${r.source.start}, ${r.source.end})</small></p>`).join("")}
    <div class="tablewrap"><table><thead><tr><th>ID</th><th>Criterion</th><th>Priority</th></tr></thead><tbody>
    ${c.criteria.map((x) => `<tr><td class="id">${esc(x.id)}</td><td>${esc(x.title)} <small>${esc(x.status || "needs review")} · ${(x.requirement_ids || []).map(esc).join(", ") || "No explicit source requirement"}</small><div class="gwt">Given ${esc(x.given)}; when ${esc(x.when)}; then ${esc(x.then)}.</div></td><td class="id">${esc(x.priority)}</td></tr>`).join("")}
    </tbody></table></div></article>`;
}
export function planCard(p) {
  const recv = `<p class="received">Fields it received: <code>${Array.isArray(p.received_fields) ? p.received_fields.map(esc).join(", ") || "none" : "unreported"}</code></p>`;
  if (p.kind === "risk_plan") {
    return `<article class="card art enter" aria-label="Risk plan">
      <header><h3>Risk matrix and charters</h3>${stamp(p.origin, p.origin === "[::1]:5175" ? " · Risk Radar" : "")}</header>
      <div class="tablewrap"><table><thead><tr><th>Risk</th><th>Area</th><th>Impact × likelihood</th><th>Criteria</th></tr></thead><tbody>
      ${p.risks.map((r) => `<tr><td class="id">${esc(r.id)} ${esc(r.priority)}</td><td>${esc(r.area)}</td><td class="id">${esc(r.impact)} × ${esc(r.likelihood)} = ${esc(r.score)}</td><td class="id">${r.criteria.map(esc).join(" ")}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="tablewrap"><table><thead><tr><th>Charter</th><th>Mission</th><th>Timebox</th></tr></thead><tbody>
      ${p.charters.map((c) => `<tr><td class="id">${esc(c.id)}</td><td>${esc(c.mission)}</td><td class="id">${esc(c.timebox_min)} min</td></tr>`).join("")}
      </tbody></table></div>${recv}</article>`;
  }
  const cases = p.plan.cases;
  return `<article class="card art enter" aria-label="Test plan">
    <header><h3>Test plan · ${cases.length} cases</h3>${stamp(p.origin, p.origin === "localhost:5174" ? " · Test Planner" : "")}</header>
    <div class="tablewrap"><table><thead><tr><th>Case</th><th>Steps and expected result</th><th>Covers</th><th>Type</th><th>Level</th><th>Priority</th></tr></thead><tbody>
    ${cases.map((c) => `<tr><td class="id">${esc(c.id)}</td><td>${esc(c.title)}<ol>${(c.steps || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ol><b>Expected:</b> ${esc(c.expected)}</td><td class="id">${esc(c.criterion)}</td><td>${esc(c.type)}</td><td>${esc(c.level)}</td><td class="id">${esc(c.priority)}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="received">${p.plan.platform_notes.map(esc).join(" ")}</p>${recv}</article>`;
}
export function receiptCard(r, consentLog, events, { fields, routerHost, live }) {
  const decision = consentLog.map((c) => `${c.decision} ${c.origin} at ${c.time}`).join("; ") || "no contact requested";
  let traceText;
  try { traceText = JSON.stringify(redactedTrace(events), null, 1); }
  catch { traceText = "Raw trace unavailable because a tool returned data that cannot be represented as JSON."; }
  return `<article class="card art receipt enter" aria-label="Boundary receipt">
    <header><h3>Boundary receipt</h3>${stamp(location.host, " · recorded here")}</header>
    <dl>
      <dt>Consent</dt><dd>${esc(decision)}</dd>
      <dt>Origins contacted</dt><dd>${esc(r.contactedOrigins.join(", ") || "none")}</dd>
      <dt>Files fetched</dt><dd>${r.fetchedUrls.map(esc).join("<br>") || "none"}</dd>
      <dt>Validation</dt><dd>${r.validation}</dd>
      <dt>sly_data keys sent</dt><dd>${esc(r.slyKeysSent.join(", ") || "none")}</dd>
      <dt>Excluded from sly_data</dt><dd>${esc(fields.filter((k) => !r.slyKeysSent.includes(k)).join(", "))}</dd>
      <dt>Model calls</dt><dd>${esc(routerHost)}${live ? " (yours)" : ""} · sent to peers: none</dd>
      <dt>Authorization to peer</dt><dd>${r.authorizationSentToPeer}</dd>
      ${r.errors.length ? `<dt>Errors</dt><dd>${esc(r.errors.join(" | "))}</dd>` : ""}
    </dl>
    <details><summary>Raw trace (redacted)</summary><pre>${esc(traceText)}</pre></details>
  </article>`;
}
