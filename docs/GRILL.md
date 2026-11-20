# Grill log: Spec Relay

Self-interview run by the planner (grill-with-docs). The owner's standing instruction is
"accept the recommended answer", so every ✅ equals the ➡️ unless noted. Facts cited come from
`docs/RESEARCH.md`.

## Round 1: what are we proving?

**Q1. What is the one thing a judge must remember?**
➡️ "One site's agents used another site's agents in my browser, asked me first, sent only
the fields I allowed, and I swapped the other site by pasting a URL."
✅ Accepted. Every screen serves that sentence.

**Q2. Who is the user?**
➡️ A product engineer at a small team who writes a feature request and wants acceptance
criteria and a test plan, without pasting customer details into somebody else's tool.
✅ Accepted. Persona name in the demo: none (no invented people); the sample request
mentions a fictional customer "Acme Docs" so the withheld field is visible.

**Q3. Why three sites instead of one site with three networks?**
➡️ Same-origin peers skip the consent card (`requiresThirdPartyApproval`). Consent, CORS,
key isolation and swap-by-URL only mean something across origins.
✅ Accepted. Three origins locally and three hosts when deployed.

**Q4. Is the swap the hero or the share review?**
➡️ Both, in sequence: share review proves the trust boundary (conformance), swap proves
portability (impact). Share review comes first in the video.
✅ Accepted.

## Round 2: the runtime

**Q5. Write our own runtime or reuse?**
➡️ Vendor `skills/agentify-website/runtime/` unchanged (Apache-2.0). Judges score "how
effectively it uses the spec"; the reference runtime is the spec's executable definition.
✅ Accepted. ADR-0001.

**Q6. Use the stock chat UI (`mountApp`) or our own UI?**
➡️ Both on one engine: our page drives `engine.runTurn(text, { slyData })` for the relay
flow (the stock chat hard-codes its own `slyData`), and the stock chat + "⚙ AI model
settings" panel live in a "Runtime console" drawer for free chat and BYOK.
✅ Accepted.

**Q7. How do we pass private context?**
➡️ As `sly_data` on the turn, never in prompt text. The caller's front agent publishes
`allow.to_downstream.sly_data`; the runtime filters what crosses.
✅ Accepted. ADR-0002.

**Q8. How does the peer read structured criteria if its LLM agents cannot see sly_data?**
➡️ The peer's planning step is a coded tool in the peer's own bundle; it declares
`allow.to_downstream.sly_data: ["acceptance_criteria", "feature_title", "platform"]` and
runs in the caller's sandbox worker. Its LLM front agent writes the narrative in live mode.
✅ Accepted.

**Q9. Who writes the acceptance criteria?**
➡️ A Spec Desk coded tool (`CriteriaDrafter`) produces the canonical, structured criteria
(Given/When/Then) and writes `acceptance_criteria` to sly_data via
`sly_data_output_schema`; in live mode the `criteria_writer` LLM agent adds a summary and
open questions. Deterministic core, LLM polish.
✅ Accepted.

**Q10. What if sly_data written by a nested agent's coded tool does not reach the front
agent's context before the peer call?**
➡️ Spike it first (PLAN task 2). Fallback: put `CriteriaDrafter` directly in the front
agent's `tools` (no nested agent) — same ctx, verified merge path.
✅ Accepted.

## Round 3: sample mode

**Q11. What runs without a key?**
➡️ The runtime's own `browser://mock` router (`llm_router.mock: true`). It calls each tool
once in `tools` order, so tool order is the script: `criteria_writer` → `test_planner`.
✅ Accepted. ADR-0003.

**Q12. The mock's prose is ugly. What does the page show?**
➡️ Structured cards rendered from trace spans (`tool_call` results from
`CriteriaDrafter` and the peer's `PlanBuilder`, attributed to their origin), plus a clearly
labelled "Sample mode — deterministic tools, no model" badge. The mock prose is only in the
runtime console.
✅ Accepted.

**Q13. CRUSE generative UI?**
➡️ Off. The mock would call `render_cruse` with a string; our page renders its own cards.
✅ Accepted.

**Q14. Live mode provider?**
➡️ Whatever the runtime's BYOK panel supports (OpenRouter, Otari, OpenAI…);
`byok_router` = `https://openrouter.ai/api/v1`, default model a small widely available one.
Key in localStorage only, via the runtime's own panel.
✅ Accepted.

## Round 4: share review and consent

**Q15. Where does the visitor choose fields?**
➡️ Before the run, in a "Handoff ledger" beside the intake form: each field shows one of
three states — *Crosses* (publisher allows, visitor kept it), *Kept here by you*
(publisher allows, visitor unchecked), *Never leaves* (publisher's allow list excludes it;
locked). `acceptance_criteria` is required for the handoff; to withhold it, decline.
✅ Accepted.

**Q16. Why also pass fields the publisher denies?**
➡️ So the runtime's filter visibly does its job: `customer_name` and `internal_notes` are
in the turn's sly_data (used locally by `CriteriaDrafter`), and the boundary receipt shows
they were absent at the peer.
✅ Accepted.

**Q17. What does the consent card show?**
➡️ Our own card via `engine.onConsent`: peer origin (scheme + host + port), purpose
("Load and run <network> from <origin> in this browser to turn your acceptance criteria
into a test plan"), the exact request text, the ledger summary (what crosses / what stays),
"Your key stays here: model calls go to <router host>", and Allow / Decline. No
"Always allow" (spec default is per-contact approval; keeping it simple).
✅ Accepted.

**Q18. The request text is model-written in live mode. Can it leak withheld values?**
➡️ Yes in theory. A page-side leak guard scans `requestText` for any withheld field value
(case-insensitive, ≥ 4 chars) and, on a hit, disables Allow and explains — fail closed.
Instructions also forbid names and notes in requests.
✅ Accepted.

**Q19. Proof after the run?**
➡️ A "Boundary receipt" from the trace: contacted origins, fetched URLs, `sly_data` keys
that crossed (values redacted by the runtime), router host used, and "Authorization sent
to peer: no". Locally, the dev server's per-site request log corroborates it.
✅ Accepted.

## Round 5: the swap

**Q20. What is a swap, technically?**
➡️ A visitor-owned binding for Spec Desk's `test_planner` link slot, stored in
localStorage under the runtime's own key format; applied after `loadTop()` with
`network.setLink` + `runtimeAllowedPeers`; never written to the published `links.json`.
"Reset to publisher default" removes it.
✅ Accepted. ADR-0004.

**Q21. How do we keep a swap safe?**
➡️ A swap first runs the Peer Compatibility Checker (consent card for the checker's
contact, then manifest, exact network name, validation, CORS, slot contract). Only a
passing candidate can be bound. Each later call still gets the normal consent card.
✅ Accepted.

**Q22. What makes Risk Radar a meaningfully different planner?**
➡️ Different network shape and output: a risk-based exploratory charter (risk ×
likelihood matrix, session charters, time boxes) instead of a case-by-case test matrix.
Different network name too (`risk_test_planner`), proving binding is by URL not by name.
✅ Accepted.

## Round 6: community tool and conformance proof

**Q23. Is a conformance checker novel?**
➡️ No (Agent Atlas, NandaSeal exist). Ours checks **slot-contract compatibility**: does the
candidate accept the private-context fields my slot sends, expose a `request` input, resolve
by exact name, validate with the reference validator, serve CORS — then "Use as test
planner". Shipped as a page, an importable ES module and a Node CLI.
✅ Accepted.

**Q24. How do we show the §6 interoperability checks (invalid network, cycle, over-budget,
denied origin)?**
➡️ A "Conformance drills" page on Spec Desk with fixture agent sites served under
subpaths of the Risk Radar origin; each drill runs and shows the runtime's own error.
✅ Accepted (after the core flow).

**Q25. Where is the slot contract declared?**
➡️ In Spec Desk's manifest `linking.imports[]` entry for `test_planner`
(`reference`, `network`, `description`, and an `x-spec-relay-contract` object listing
`sends_sly_data` and `expects`). Unknown keys are ignored by the runtime.
✅ Accepted.

## Round 7: build and ship

**Q26. Stack?**
➡️ Plain HTML/CSS/ES modules, no bundler, no framework; one Node 22 script serves all three
sites with correct headers; `node --test` + Playwright for an end-to-end smoke test.
✅ Accepted.

**Q27. Ports and host names?**
➡️ Spec Desk `http://127.0.0.1:5173`, Test Planner `http://localhost:5174`, Risk Radar
`http://[::1]:5175`. Three host names, because the runtime mirrors BYOK keys into a
per-host-name cookie on loopback.
✅ Accepted. ADR-0005.

**Q28. Where does the vendored runtime live?**
➡️ Once, in `vendor/nsdeploy-runtime/`, served at `/runtime/` by each site's server and
copied into each site by the static build.
✅ Accepted.

**Q29. Deployment?**
➡️ `npm run build -- --target public` writes `dist/<site>/` with peer URLs rewritten from
`sites.config.json` and a `_headers` file; owner deploys three projects (e.g. Netlify or
Cloudflare Pages). Not done by agents.
✅ Accepted.

**Q30. What do we not build?**
➡️ Accounts, a database, server-side inference, cross-site write actions, MCP servers,
signatures. Listed under Known limitations.
✅ Accepted.
