import { createReviewedHandoff } from "./relay/reviewed-handoff.js";
import { relayMarkdown, downloadReview } from "/shared/export.js";
import { bootSite } from "/shared/boot-site.js";
import { checkPeer, peerTarget } from "/shared/peer-check.js";
import { allowRule, ledgerRows } from "./relay/ledger.js";
import { applyBinding, saveBinding, resetBinding, SLOT } from "./relay/binding.js";
import { installPeerBoundary } from "./relay/peer-boundary.js";
import { esc, hostOf, stamp } from "./ui/html.js";
import { criteriaCard, planCard, receiptCard } from "./ui/cards.js";
import { createConsentDialog } from "./ui/consent.js";
import { createTimeline } from "./ui/timeline.js";

const $ = (s, el = document) => el.querySelector(s);

const SAMPLE = {
  feature_request: "Add undo and redo to our collaborative document editor. Undo must only revert my own edits.",
  feature_title: "Undo/redo",
  platform: "Web (React, CRDT sync)",
  customer_name: "Acme Docs (pilot)",
  internal_notes: "Pilot threatened to churn over lost edits. Do not share outside the team.",
};


const form = $("#intake");
for (const [k, v] of Object.entries(SAMPLE)) form.elements[k].value = v;
const unticked = new Set();
const revealed = new Set();
let allowed = [];
let contract = { sends_sly_data: [], requires_sly_data: ["acceptance_criteria"] };
let booted = null;
let binding = null;
let peerBoundary;
let reviewedHandoff = null;
const exportButton = document.createElement("button");
exportButton.type = "button"; exportButton.className = "btn"; exportButton.textContent = "Download review Markdown";
exportButton.hidden = true;
$("#results").before(exportButton);
exportButton.addEventListener("click", () => downloadReview(relayMarkdown(reviewedHandoff.exportData())));
const review = document.createElement("section");
review.className = "card";
review.hidden = true;
review.innerHTML = '<h2>Review criteria</h2><p>Edit the suggested checks, then approve this exact snapshot for planning.</p><textarea id="review-criteria" rows="12" aria-label="Reviewed criteria JSON"></textarea><p id="review-status" role="status"></p><button id="approve-plan" class="btn primary" type="button">Approve and plan</button>';
$("#results").before(review);
const invalidate = () => {
  reviewedHandoff?.invalidate();
  if (window.__relay?.last?.plan) $("#review-status").textContent = "Plan is stale after edits. Approve and plan again.";
};
review.addEventListener("input", invalidate);
form.addEventListener("input", () => { review.hidden = true; invalidate(); });
$("#approve-plan").addEventListener("click", () => runRelay(true));

const intake = () => Object.fromEntries(Object.keys(SAMPLE).map((k) => [k, form.elements[k].value.trim()]));

function renderLedger() {
  const values = intake();
  const rows = ledgerRows(allowed, contract.requires_sly_data, unticked);
  $("#ledger").innerHTML = rows.map((r) => {
    const raw = r.generated ? "generated from your intake when you run" : values[r.key] || "(empty)";
    const masked = r.private && !revealed.has(r.key) && values[r.key];
    const pillText = r.key === "feature_request" && r.state === "never" ? "Request text only"
      : { crosses: "Crosses", kept: "Kept here by you", never: "Never leaves" }[r.state];
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
  invalidate();
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

const dlg = $("#consent");
const consentCard = createConsentDialog(dlg);

const { step, onTrace, reset: resetTimeline } = createTimeline($("#timeline"), $("#results"));

async function runRelay(approved = false) {
  approved = approved === true;
  if (!reviewedHandoff || reviewedHandoff.state.running || peerBoundary.isActive()) return;
  let result;
  try {
    result = await reviewedHandoff.run(approved);
  } catch (error) {
    $("#review-status").textContent = error.message;
  } finally {
    for (const selector of ["#approve-plan", "#run", "#swap-btn", "#reset-btn"]) $(selector).disabled = false;
  }
  if (!result) return;
  const { criteria, plan, receipt, peerAnswer, consentLog, events, failure, stale } = result;
  const out = [];
  exportButton.hidden = false;
  if (criteria) out.push(criteriaCard(criteria));
  if (!approved && criteria) {
    $("#review-criteria").value = JSON.stringify(criteria.criteria, null, 2);
    $("#review-status").textContent = "Draft ready for review. No planner contacted.";
    review.hidden = !reviewedHandoff.state.reviewReady;
  }
  if (plan) out.push(planCard(plan));
  else if (peerAnswer) out.push(`<article class="card art enter"><header><h3>Planner reply excerpt</h3>${stamp(peerAnswer.origin)}</header><p>${esc(peerAnswer.text)}</p></article>`);
  if (failure) step("The run stopped", "stop", esc(failure));
  out.push(receiptCard(receipt, consentLog, events, { fields: Object.keys(SAMPLE), routerHost: booted.routerHost, live: booted.mode.live }));
  step("Receipt written");
  $("#results").innerHTML = out.join("");
  window.__relay.last = reviewedHandoff.exportData();
  if (stale) $("#review-status").textContent = "Inputs changed during this run. Review and plan again.";
}

$("#run").addEventListener("click", () => runRelay());

const swap = $("#swap");
let checked = null;
let checkVersion = 0;
function clearCheck() {
  checkVersion++;
  checked = null;
  $("#check-out").replaceChildren();
  $("#use-btn").disabled = true;
}
$("#swap-btn").addEventListener("click", () => {
  if (peerBoundary.isActive()) return;
  clearCheck();
  swap.showModal();
  $("#swap-title").focus();
});
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
    const report = await checkPeer(url.href, { runtime, contract, fetch: peerBoundary.fetch });
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
  invalidate();
  swap.close();
  $("#run").focus();
});
$("#reset-btn").addEventListener("click", () => {
  if (peerBoundary.isActive()) return;
  resetBinding(localStorage, booted.engine.top.base);
  binding = applyBinding(booted.engine, localStorage);
  renderSlot();
  invalidate();
});

window.__relay = { run: runRelay };
booted = await bootSite({ consoleEl: $("#agent-app"), badgeEl: $("#mode") });
if (booted) {
  allowed = allowRule(booted.engine.top.network.config);
  const imp = (booted.engine.top.manifest.linking?.imports || []).find((i) => i.reference === SLOT);
  contract = imp?.["x-spec-relay-contract"] || contract;
  binding = applyBinding(booted.engine, localStorage);
  peerBoundary = installPeerBoundary(booted.engine, SLOT);
  const { Engine, TraceBus } = await import("/runtime/index.js");
  const handoffTrace = new TraceBus();
  const handoffEngine = new Engine({ originUrl: `${location.origin}/handoff`, trace: handoffTrace,
    sandboxWorkerUrl: "/runtime/sandbox-worker.js", byokKey: booted.engine.byokKey,
    routerOverride: booted.engine.routerOverride });
  handoffEngine.modelOverride = booted.engine.modelOverride;
  await handoffEngine.loadTop();
  installPeerBoundary(handoffEngine, SLOT);
  reviewedHandoff = createReviewedHandoff({
    draft: booted, handoff: { engine: handoffEngine, trace: handoffTrace }, allowed, localOrigin: location.host,
    read: () => ({ values: intake(), unticked, reviewedText: $("#review-criteria").value }),
    bind: () => (binding = applyBinding(booted.engine, localStorage)),
    onTrace,
    onStart: () => {
      for (const selector of ["#approve-plan", "#run", "#swap-btn", "#reset-btn"]) $(selector).disabled = true;
      resetTimeline();
      $("#results").innerHTML = "";
      renderSlot();
    },
    consent: async (info) => {
      const li = step(`Waiting for your consent to contact ${esc(info.peerOrigin)}`, "wait");
      const decision = await consentCard({
        origin: info.peerOrigin,
        purpose: `Load the published network <code>${esc(hostOf(info.target) === info.peerOrigin ? info.target.split("/").pop() : info.peerLabel)}</code> from <code>${esc(new URL(info.target).origin)}</code> and run it in this browser to turn your acceptance criteria into a test plan.`,
        requestText: info.requestText, payload: info.payload, crossing: info.crossing,
        staying: info.staying, withheld: info.withheld, routerHost: booted.routerHost,
      });
      li.className = decision === "allow" ? "done" : "stop";
      li.querySelector("span").firstChild.textContent = decision === "allow" ? `You allowed contact with ${info.peerOrigin}` : `Declined. Nothing was sent to ${info.peerOrigin}.`;
      return decision;
    },
  });
  window.__relay.booted = booted;
  $("#run").disabled = false;
  $("#swap-btn").disabled = false;
}
renderLedger();
renderSlot();
document.body.dataset.ready = "1";
