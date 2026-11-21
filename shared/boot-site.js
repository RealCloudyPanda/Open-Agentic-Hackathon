export async function bootSite({ consoleEl, badgeEl } = {}) {
  try {
    const { boot } = await import("/runtime/index.js");
    const mount = consoleEl || Object.assign(document.createElement("div"), { hidden: true });
    if (!consoleEl) document.body.append(mount);
    const booted = await boot(mount, {
      originUrl: location.origin,
      sandboxWorkerUrl: new URL("/runtime/sandbox-worker.js", location.origin).href,
    });
    const llm = booted.engine.top.llm;
    const mode = llm.mock
      ? { live: false, text: "Sample mode · no AI key · deterministic tools" }
      : { live: true, text: `Live · ${hostOf(llm.baseUrl)} · ${booted.engine.modelOverride || booted.engine.top.network.config?.llm_config?.model_name || "default model"}` };
    if (badgeEl) { badgeEl.textContent = mode.text; badgeEl.classList.toggle("live", mode.live); }
    return { ...booted, mode, routerHost: llm.mock ? "browser://mock (in this tab)" : hostOf(llm.baseUrl) };
  } catch (err) {
    if (badgeEl) { badgeEl.textContent = "Runtime unavailable"; badgeEl.classList.add("live"); }
    const note = document.createElement("p");
    note.className = "card"; note.setAttribute("role", "alert");
    note.textContent = `The agent runtime could not start: ${err.message}. The page still works; reload to try again.`;
    (consoleEl || document.body).prepend(note);
    return null;
  }
}
function hostOf(u) { try { return new URL(u).host; } catch { return String(u); } }
