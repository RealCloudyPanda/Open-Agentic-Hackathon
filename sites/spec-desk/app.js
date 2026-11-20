// Spec Desk page: intake, handoff ledger, consent card, relay timeline, results, swap.
// Drives the unmodified reference runtime through its public Engine API.
import { bootSite } from "/shared/boot-site.js";
import { artifactsFrom, redactedTrace } from "/shared/trace-artifacts.js";
import { checkPeer, peerTarget } from "/shared/peer-check.js";
import { allowRule, ledgerRows, buildSlyData, findLeaks } from "./relay/ledger.js";
import { applyBinding, saveBinding, resetBinding, SLOT } from "./relay/binding.js";
import { installPeerBoundary } from "./relay/peer-boundary.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const hostOf = (u) => { try { return new URL(u).host; } catch { return u; } };

const SAMPLE = {
  feature_request: "Add undo and redo to our collaborative document editor. Undo must only revert my own edits.",
  feature_title: "Undo/redo",
  platform: "Web (React, CRDT sync)",
  customer_name: "Acme Docs (pilot)",
  internal_notes: "Pilot threatened to churn over lost edits. Do not share outside the team.",
};
const STAMP = { "127.0.0.1:5173": "var(--desk)", "localhost:5174": "var(--planner)", "[::1]:5175": "var(--radar)" };
const stamp = (origin, extra = "") => `<span class="stamp" style="--stamp:${STAMP[origin] || "var(--ink-2)"}">${esc(origin)}${extra}</span>`;

const form = $("#intake");
for (const [k, v] of Object.entries(SAMPLE)) form.elements[k].value = v;
const unticked = new Set();
const revealed = new Set();
let allowed = [];
let contract = { sends_sly_data: [], requires_sly_data: ["acceptance_criteria"] };
let booted = null;
let binding = null;
let running = false;
let publicFetch;

const intake = () => Object.fromEntries(Object.keys(SAMPLE).map((k) => [k, form.elements[k].value.trim()]));

function renderLedger() {
  const values = intake();
  const rows = ledgerRows(allowed, contract.requires_sly_data, unticked);
  $("#ledger").innerHTML = rows.map((r) => {
    const raw = r.generated ? "generated from your intake when you run" : values[r.key] || "(empty)";
    const masked = r.private && !revealed.has(r.key) && values[r.key];
    const pillText = { crosses: "Crosses", kept: "Kept here by you", never: "Never leaves" }[r.state];
    return `<li>
      ${r.toggleable ? `<input type="checkbox" data-k="${r.key}" ${r.state === "crosses" ? "checked" : ""} aria-label="Share ${esc(r.label)} with the planner">` : "<span></span>"}
      <span><span class="k">${r.key}</span> · ${esc(r.label)}</span>
      <span class="pill ${r.state}">${pillText}</span>
      <span class="v">${masked ? "••••••••" : esc(raw)} ${r.private && values[r.key] ? `<button type="button" class="reveal" data-r="${r.key}">${masked ? "reveal" : "hide"}</button>` : ""}</span>
      <span class="why">${esc(r.reason)}</span>
    </li>`;
  }).join("");
}
$("#ledger").addEventListener("change", (e) => {
  const k = e.target.dataset.k; if (!k) return;
  e.target.checked ? unticked.delete(k) : unticked.add(k);
  renderLedger();
  $(`#ledger [data-k="${k}"]`)?.focus();
});
$("#ledger").addEventListener("click", (e) => {
  const k = e.target.dataset.r; if (!k) return;
  revealed.has(k) ? revealed.delete(k) : revealed.add(k);
  renderLedger();
});
form.addEventListener("input", renderLedger);

function renderSlot() {
  const t = binding?.target || "";
  $("#slot-target").textContent = t.replace(/^https?:\/\//, "");
  $("#slot-owner").innerHTML = binding?.visitorChoice ? "<b>your choice</b> · stored in this browser only" : "publisher default · from Spec Desk's links.json";
  $("#reset-btn").hidden = !binding?.visitorChoice;
}

// ---- consent card ------------------------------------------------------------
const dlg = $("#consent");
function consentCard({ origin, purpose, requestText = null, crossing = [], staying = [], withheld = {}, routerHost, checker = false }) {
  const leaks = requestText ? findLeaks(requestText, withheld) : [];
  dlg.innerHTML = `
    <h2 id="consent-title" tabindex="-1">Contact <b>${esc(origin)}</b>?</h2>
    <p>${purpose}</p>
    ${requestText !== null ? `<p class="label">Request text</p><div class="req">${esc(requestText)}</div>
      <p class="guard ${leaks.length ? "bad" : "ok"}">${leaks.length ? `Blocked: the request contains your ${leaks.map((k) => `<code>${k}</code>`).join(", ")} value.` : "Leak guard: no withheld values found in the request."}</p>` : ""}
    ${checker ? "" : `<div class="cols"><div><p class="label">Fields that will cross</p><ul>${crossing.map((k) => `<li>${k}</li>`).join("") || "<li>none</li>"}</ul></div>
      <div><p class="label">Fields that stay here</p><ul>${staying.map((k) => `<li>${k}</li>`).join("")}</ul></div></div>`}
    <p class="key">${routerHost?.startsWith("browser://") ? "No AI key in use (sample mode)." : `Your AI key stays with your router (<code>${esc(routerHost)}</code>). The peer site never receives it.`} Requests carry no cookies or credentials.</p>
    <div class="row end"><button class="btn ghost" data-d="decline" type="button">Decline</button><button class="btn primary" data-d="allow" type="button" ${leaks.length ? "disabled" : ""}>${checker ? "Allow reading" : "Allow this contact"}</button></div>`;
  return new Promise((resolve) => {
    const finish = (d) => { dlg.removeEventListener("cancel", onCancel); dlg.close(); resolve(d); };
    const onCancel = (e) => { e.preventDefault(); finish("decline"); };
    dlg.addEventListener("cancel", onCancel);
    dlg.onclick = (e) => { const d = e.target.closest("[data-d]")?.dataset.d; if (d) finish(d); };
    dlg.showModal();
    $("#consent-title").focus();
  });
}

// ---- timeline ----------------------------------------------------------------
const tl = $("#timeline");
const pendingSteps = new Map();
function step(text, cls = "done", detail = "") {
  const li = document.createElement("li");
  li.className = cls;
  li.innerHTML = `<span>${text}${detail ? `<small>${detail}</small>` : ""}</span>`;
  tl.append(li);
  return li;
}

function onTrace(e) {
  const ev = e.detail;
  if (ev.kind === "agent" && ev.phase === "start" && ev.agent === "criteria_writer") step("Drafting criteria <span class='mono'>(Spec Desk, in your browser)</span>", "wait");
  if (ev.kind === "tool_call" && ev.phase === "end" && ev.tool === "CriteriaDrafter") {
    tl.lastElementChild?.classList.replace("wait", "done");
    step(`Drafted ${ev.result?.criteria?.length ?? 0} acceptance criteria`);
  }
  if (ev.kind === "remote_fetch" && ev.phase === "start") pendingSteps.set(ev.id, step(`Fetching published files from ${esc(ev.peerOrigin)}`, "wait"));
  if (ev.kind === "remote_fetch" && ev.phase === "end") {
    pendingSteps.get(ev.id)?.classList.replace("wait", ev.status === "ok" ? "done" : "stop");
    pendingSteps.delete(ev.id);
    if (ev.status === "ok") {
      step(`Validated <span class="mono">${esc(ev.network)}</span> with the reference validator`);
    } else step("Refused", "stop", esc(ev.error));
  }
  if (ev.kind === "peer_artifact" && ev.received) step("Read public artifact", "done", esc(ev.url));
  if (ev.kind === "remote_call" && ev.phase === "start") pendingSteps.set(ev.id, step(`Running <span class="mono">${esc(ev.network)}</span> in your browser on your router`, "wait", `sly_data sent: ${esc(Object.keys(ev.requestPayload?.sly_data || {}).join(", ") || "none")}`));
  if (ev.kind === "remote_call" && ev.phase === "end") {
    pendingSteps.get(ev.id)?.classList.replace("wait", ev.status === "ok" ? "done" : "stop");
    pendingSteps.delete(ev.id);
  }
  if ((ev.kind === "composition_limit" || ev.kind === "composition_skip")) step("Skipped by the runtime", "stop", esc(ev.reason));
}

// ---- results -----------------------------------------------------------------
function criteriaCard(c) {
  return `<article class="card art enter" aria-label="Acceptance criteria">
    <header><h3>Acceptance criteria</h3>${stamp(c.origin, " · Spec Desk")}</header>
    <div class="tablewrap"><table><thead><tr><th>ID</th><th>Criterion</th><th>Priority</th></tr></thead><tbody>
    ${c.criteria.map((x) => `<tr><td class="id">${x.id}</td><td>${esc(x.title)}<div class="gwt">Given ${esc(x.given)}; when ${esc(x.when)}; then ${esc(x.then)}.</div></td><td class="id">${x.priority}</td></tr>`).join("")}
    </tbody></table></div></article>`;
}
function planCard(p) {
  const recv = `<p class="received">Fields it received: <code>${(p.received_fields || []).join(", ") || "none"}</code></p>`;
  if (p.kind === "risk_plan") {
    return `<article class="card art enter" aria-label="Risk plan">
      <header><h3>Risk matrix and charters</h3>${stamp(p.origin, " · Risk Radar")}</header>
      <div class="tablewrap"><table><thead><tr><th>Risk</th><th>Area</th><th>Impact × likelihood</th><th>Criteria</th></tr></thead><tbody>
      ${p.risks.map((r) => `<tr><td class="id">${r.id} ${r.priority}</td><td>${esc(r.area)}</td><td class="id">${r.impact} × ${r.likelihood} = ${r.score}</td><td class="id">${r.criteria.join(" ")}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="tablewrap"><table><thead><tr><th>Charter</th><th>Mission</th><th>Timebox</th></tr></thead><tbody>
      ${p.charters.map((c) => `<tr><td class="id">${c.id}</td><td>${esc(c.mission)}</td><td class="id">${c.timebox_min} min</td></tr>`).join("")}
      </tbody></table></div>${recv}</article>`;
  }
  const cases = p.plan.cases;
  return `<article class="card art enter" aria-label="Test plan">
    <header><h3>Test plan · ${cases.length} cases</h3>${stamp(p.origin, " · Test Planner")}</header>
    <div class="tablewrap"><table><thead><tr><th>Case</th><th>Covers</th><th>Type</th><th>Level</th><th>Priority</th></tr></thead><tbody>
    ${cases.map((c) => `<tr><td class="id">${c.id}</td><td class="id">${c.criterion}</td><td>${c.type}</td><td>${c.level}</td><td class="id">${c.priority}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="received">${p.plan.platform_notes.map(esc).join(" ")}</p>${recv}</article>`;
}
function receiptCard(r, consentLog, events) {
  const decision = consentLog.map((c) => `${c.decision} ${c.origin} at ${c.time}`).join("; ") || "no contact requested";
  return `<article class="card art receipt enter" aria-label="Boundary receipt">
    <header><h3>Boundary receipt</h3>${stamp(location.host, " · recorded here")}</header>
    <dl>
      <dt>Consent</dt><dd>${esc(decision)}</dd>
      <dt>Origins contacted</dt><dd>${esc(r.contactedOrigins.join(", ") || "none")}</dd>
      <dt>Files fetched</dt><dd>${r.fetchedUrls.map(esc).join("<br>") || "none"}</dd>
      <dt>Validation</dt><dd>${r.validation}</dd>
      <dt>sly_data keys sent</dt><dd>${esc(r.slyKeysSent.join(", ") || "none")}</dd>
      <dt>Excluded from sly_data</dt><dd>${esc(Object.keys(SAMPLE).filter((k) => !r.slyKeysSent.includes(k)).join(", "))}</dd>
      <dt>Model calls</dt><dd>${esc(booted.routerHost)}${booted.mode.live ? " (yours)" : ""} · sent to peers: none</dd>
      <dt>Authorization to peer</dt><dd>${r.authorizationSentToPeer}</dd>
      ${r.errors.length ? `<dt>Errors</dt><dd>${esc(r.errors.join(" | "))}</dd>` : ""}
    </dl>
    <details><summary>Raw trace (redacted)</summary><pre>${esc(JSON.stringify(redactedTrace(events), null, 1))}</pre></details>
  </article>`;
}

// ---- run ---------------------------------------------------------------------
async function runRelay() {
  if (running || !booted) return;
  running = true;
  $("#run").disabled = true;
  $("#swap-btn").disabled = true;
  $("#reset-btn").disabled = true;
  const { engine, trace } = booted;
  binding = applyBinding(engine, localStorage);
  renderSlot();
  engine.resetHistory();
  tl.innerHTML = "";
  pendingSteps.clear();
  $("#results").innerHTML = "";
  const since = trace.events.at(-1)?.seq ?? -1;
  const values = intake();
  const slyData = buildSlyData(values, unticked);
  const crossing = allowed.filter((k) => k === "acceptance_criteria" || (k in slyData));
  const staying = Object.keys(SAMPLE).filter((k) => !crossing.includes(k));
  const withheld = Object.fromEntries(staying.filter((k) => k !== "feature_request").map((k) => [k, values[k]]));
  const consentLog = [];
  const consoleConsent = engine.onConsent;
  engine.onConsent = async (info) => {
    const li = step(`Waiting for your consent to contact ${esc(info.peerOrigin)}`, "wait");
    const d = await consentCard({
      origin: info.peerOrigin,
      purpose: `Load the published network <code>${esc(hostOf(binding.target) === info.peerOrigin ? binding.target.split("/").pop() : info.peerLabel)}</code> from <code>${esc(new URL(binding.target).origin)}</code> and run it in this browser to turn your acceptance criteria into a test plan.`,
      requestText: info.requestText, crossing, staying, withheld, routerHost: booted.routerHost,
    });
    consentLog.push({ origin: info.peerOrigin, decision: d === "allow" ? "allowed" : "declined", time: new Date().toLocaleTimeString() });
    li.className = d === "allow" ? "done" : "stop";
    li.querySelector("span").firstChild.textContent = d === "allow" ? `You allowed contact with ${info.peerOrigin}` : `Declined. Nothing was sent to ${info.peerOrigin}.`;
    return d === "allow" ? "allow" : "decline";
  };
  trace.addEventListener("event", onTrace);
  try {
    await engine.runTurn(values.feature_request || "Draft acceptance criteria.", { slyData });
  } catch (err) {
    step("The run stopped", "stop", esc(err.message));
  } finally {
    engine.onConsent = consoleConsent;
    trace.removeEventListener("event", onTrace);
  }
  const events = trace.events.filter((e) => e.seq > since);
  const { criteria, plan, receipt } = artifactsFrom(trace.events, { since });
  const out = [];
  if (criteria) out.push(criteriaCard(criteria));
  if (plan) out.push(planCard(plan));
  out.push(receiptCard(receipt, consentLog, events));
  step("Receipt written");
  $("#results").innerHTML = out.join("");
  window.__relay.last = { criteria, plan, receipt, consentLog };
  running = false;
  $("#run").disabled = false;
  $("#swap-btn").disabled = false;
  $("#reset-btn").disabled = false;
}
$("#run").addEventListener("click", runRelay);

// ---- swap --------------------------------------------------------------------
const swap = $("#swap");
let checked = null;
let checkVersion = 0;
function clearCheck() {
  checkVersion++;
  checked = null;
  $("#check-out").replaceChildren();
  $("#use-btn").disabled = true;
}
$("#swap-btn").addEventListener("click", () => { clearCheck(); swap.showModal(); $("#swap-title").focus(); });
swap.addEventListener("click", (e) => {
  const url = e.target.closest(".pick")?.dataset.url;
  if (url) { $("#swap-url").value = url; clearCheck(); }
});
$("#swap-url").addEventListener("input", clearCheck);
$("#check-btn").addEventListener("click", async () => {
  clearCheck();
  const version = checkVersion;
  let url;
  let origin;
  try {
    ({ url } = peerTarget($("#swap-url").value.trim()));
    origin = url.origin;
    if (origin === location.origin) throw new Error("Choose a planner on a separate origin.");
  } catch (error) {
    $("#check-out").innerHTML = `<p class="verdict">${esc(error.message)}</p>`;
    return;
  }
  swap.close();
  const d = await consentCard({ origin, purpose: `Read public files from <code>${esc(origin)}</code> to check compatibility. Nothing is run.`, checker: true, routerHost: booted.routerHost });
  swap.showModal();
  if (d !== "allow") { $("#check-out").innerHTML = `<p class="verdict">Declined. Nothing was read.</p>`; return; }
  $("#check-out").innerHTML = `<p class="hint">Checking…</p>`;
  try {
    const runtime = await import("/runtime/index.js");
    const report = await checkPeer(url.href, { runtime, contract, fetch: publicFetch });
    if (version !== checkVersion) return;
    checked = report;
    $("#check-out").innerHTML = `<p class="verdict">${report.verdict}</p><ul class="checks">${report.results.map((r) => `<li><span class="lv ${r.level}">${r.level}</span><span><b>${r.n}. ${esc(r.name)}</b> — ${esc(r.detail)}</span></li>`).join("")}</ul>`;
    $("#use-btn").disabled = !report.ok;
  } catch (error) {
    if (version === checkVersion) $("#check-out").innerHTML = `<p class="verdict">${esc(error.message)}</p>`;
  }
});
$("#use-btn").addEventListener("click", () => {
  if (!checked?.ok) return;
  try {
    saveBinding(localStorage, booted.engine.top.base, checked.url, [...booted.engine.top.network.linkSlots]);
  } catch (error) {
    $("#check-out").innerHTML = `<p class="verdict">Could not save this planner. ${esc(error.message)}</p>`;
    return;
  }
  binding = applyBinding(booted.engine, localStorage);
  renderSlot();
  swap.close();
  $("#run").focus();
});
$("#reset-btn").addEventListener("click", () => {
  resetBinding(localStorage, booted.engine.top.base);
  binding = applyBinding(booted.engine, localStorage);
  renderSlot();
});

// ---- boot --------------------------------------------------------------------
window.__relay = { run: runRelay };
booted = await bootSite({ consoleEl: $("#agent-app"), badgeEl: $("#mode") });
if (booted) {
  allowed = allowRule(booted.engine.top.network.config);
  const imp = (booted.engine.top.manifest.linking?.imports || []).find((i) => i.reference === SLOT);
  contract = imp?.["x-spec-relay-contract"] || contract;
  binding = applyBinding(booted.engine, localStorage);
  publicFetch = installPeerBoundary(booted.engine, SLOT);
  window.__relay.booted = booted;
  $("#run").disabled = false;
  $("#swap-btn").disabled = false;
}
renderLedger();
renderSlot();
document.body.dataset.ready = "1";
