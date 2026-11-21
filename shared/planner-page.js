import { bootSite } from "/shared/boot-site.js";
import { artifactsFrom } from "/shared/trace-artifacts.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function plannerPage({ network, sample }) {
  $("#criteria").value = sample;
  const url = `${location.origin}/${network}`;
  $("#net-url").textContent = url;
  $("#copy").addEventListener("click", async () => { try { await navigator.clipboard.writeText(url); $("#copy").textContent = "Copied"; } catch { $("#copy").textContent = "Select and copy"; } });
  const booted = await bootSite({ consoleEl: $("#agent-app"), badgeEl: $("#mode") });
  const files = ["agent-manifest.json", `${network}.network.json`, `${network}.hocon`, "links.json", booted?.engine.top.manifest.coded_tools?.bundle?.replace("./", "")].filter(Boolean);
  $("#files").innerHTML = files.map((f) => `<li><a class="mono" href="/${f}">/${f}</a></li>`).join("");
  $("#run").disabled = !booted;
  $("#run").addEventListener("click", async () => {
    $("#run").disabled = true;
    const { engine, trace } = booted;
    engine.resetHistory();
    const since = trace.events.at(-1)?.seq ?? -1;
    try { await engine.runTurn($("#criteria").value); } catch (e) { $("#out").innerHTML = `<p class="card" role="alert">${esc(e.message)}</p>`; }
    const { plan } = artifactsFrom(trace.events, { since });
    if (plan) $("#out").innerHTML = render(plan);
    $("#run").disabled = false;
  });
  document.body.dataset.ready = "1";
}

function render(p) {
  if (p.kind === "risk_plan") {
    const cell = (i, l) => p.risks.filter((r) => r.impact === i && r.likelihood === l).map((r) => `<span class="chip">${r.id}</span>`).join(" ");
    return `<article class="card art enter"><h3>Risk matrix</h3>
      <div class="matrix" aria-hidden="true"><span></span><span class="label">Likelihood 1</span><span class="label">2</span><span class="label">3</span>
      ${[3, 2, 1].map((i) => `<span class="label">Impact ${i}</span>${[1, 2, 3].map((l) => `<span class="cell s${i * l}">${cell(i, l)}</span>`).join("")}`).join("")}</div>
      <table><caption class="sr-only">Risks</caption><thead><tr><th>Risk</th><th>Area</th><th>Score</th><th>Criteria</th></tr></thead><tbody>
      ${p.risks.map((r) => `<tr><td class="id">${r.id} ${r.priority}</td><td>${esc(r.area)}</td><td class="id">${r.impact} × ${r.likelihood} = ${r.score}</td><td class="id">${r.criteria.join(" ")}</td></tr>`).join("")}</tbody></table>
      <h3>Exploratory charters</h3><table><thead><tr><th>Charter</th><th>Mission</th><th>Timebox</th></tr></thead><tbody>
      ${p.charters.map((c) => `<tr><td class="id">${c.id}</td><td>${esc(c.mission)}</td><td class="id">${c.timebox_min} min</td></tr>`).join("")}</tbody></table></article>`;
  }
  return `<article class="card art enter"><h3>Test plan · ${p.plan.cases.length} cases</h3><table><thead><tr><th>Case</th><th>Title</th><th>Type</th><th>Level</th><th>Priority</th></tr></thead><tbody>
    ${p.plan.cases.map((c) => `<tr><td class="id">${c.id}</td><td>${esc(c.title)}<ol>${(c.steps || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ol><div class="gwt">Expected: ${esc(c.expected)}</div></td><td>${c.type}</td><td>${c.level}</td><td class="id">${c.priority}</td></tr>`).join("")}</tbody></table>
    <p>${p.plan.platform_notes.map(esc).join(" ")}</p></article>`;
}
