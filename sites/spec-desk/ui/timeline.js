import { esc } from "./html.js";
import { criteriaCard } from "./cards.js";

export function createTimeline(tl, results, host = location.host) {
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
    if (ev.kind === "tool_call" && ev.phase === "end" && ev.tool === "CriteriaDrafter" && ev.origin === host && ev.status === "ok") {
      tl.lastElementChild?.classList.replace("wait", "done");
      step(`Drafted ${ev.result?.criteria?.length ?? 0} acceptance criteria`);
      if (Array.isArray(ev.result?.criteria)) {
        results.innerHTML = criteriaCard({ ...ev.result, origin: ev.origin });
      }
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

  function reset() {
    tl.innerHTML = "";
    pendingSteps.clear();
  }

  return { step, onTrace, reset };
}
