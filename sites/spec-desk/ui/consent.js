import { findLeaks } from "../relay/ledger.js";
import { esc } from "./html.js";

export function createConsentDialog(dlg) {
  return function consentCard({ origin, purpose, requestText = null, crossing = [], staying = [], withheld = {}, routerHost, checker = false, payload = null }) {
  const leaks = requestText ? findLeaks(requestText + (payload ? JSON.stringify(payload) : ""), withheld) : [];
  dlg.innerHTML = `
    <h2 id="consent-title" tabindex="-1">Contact <b>${esc(origin)}</b>?</h2>
    <p>${purpose}</p>
    ${requestText !== null ? `<p class="label">Request text</p><div class="req">${esc(requestText)}</div>
      <p class="guard ${leaks.length ? "bad" : "ok"}">${leaks.length ? `Blocked: the request contains your ${leaks.map((k) => `<code>${k}</code>`).join(", ")} value.` : "Leak guard: no withheld values found in the request."}</p>` : ""}
    ${payload ? `<details open><summary>Exact approved structured context</summary><pre>${esc(JSON.stringify(payload, null, 2))}</pre></details>` : ""}
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
    dlg.querySelector("#consent-title").focus();
  });
}
}
