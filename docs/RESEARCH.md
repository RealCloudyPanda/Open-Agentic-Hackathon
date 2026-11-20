# Research notes: the spec and the reference implementation

Source: `cognizant-ai-labs/agentic-web`, cloned at commit `0516537` (2026-11-19). All paths
below are relative to that repository. Everything here was read from the files, not
remembered.

> **Version note.** The spec file is now **MVP Profile 0.3 (18 November 2026)**, not 0.2.
> Quote section numbers from 0.3. The community list (`docs/agentic_websites.md`) still
> mentions "Profile 0.2" for one entry; that is stale.

## 1. What makes a conforming site

Spec `docs/worldwide_agentic_web_mvp_spec.md` §3.3 "Minimum Public Files", plus the
reference build output in `examples/*_agentified/`.

| File | Required? | Content | Hosting rule |
| --- | --- | --- | --- |
| `agent-manifest.json` | **MUST** | `networks[]` each with `name`, `front_man`, `hocon` (path or URL of the resolved network); `llm_router` (top-site router metadata); peer policy (`allowed_peers` + `peer_policy.mode`); optional `brand`, `theme`, `linking`, `deployment`, `actions`, `coded_tools`, `agent_mcp` | Public GET at the site base, CORS `*` |
| `<network>.network.json` | **MUST** | Resolved Neuro SAN network, JSON serialisation of HOCON (no includes, no substitutions) | Public GET, CORS `*` |
| `links.json` | **MUST (table row)** | `{ "version": 1, "networks": { "<network>": { "<symbolic ref>": "<peer network URL>" } } }` — publisher-owned default bindings | Public GET, CORS `*`; visitor overrides stored separately by the caller origin |
| `<network>.hocon` | Recommended | Canonical authoring source (spec §2: HOCON canonical, JSON allowed for browser loading) | Public is fine |
| coded-tool bundle | Optional | Self-contained ES module, optional SRI `coded_tools.integrity` | Public GET (CORS when cross-origin); runs only in the sandbox worker |
| `agent-mcp.json`, `.well-known/nsdeploy.json`, `.well-known/nsdeploy-agent.json` | Optional discovery | Copies of manifest parts | Not required for conformance (§3.3) |
| `bridge/action-bridge.html` + `bridge/agent-manifest.json` | Only if `actions.bridge` is set | Cross-site action bridge (an extension) | No `X-Frame-Options` |
| `runtime/sandbox-worker.js` | If coded tools run | — | MUST be served with CSP `default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'` or the worker refuses to run tools (`runtime/sandbox-worker.js` probes for it) |

Peer URL convention (§3.2 step 1): `https://host/base/<network_name>`. The runtime strips the
last segment, fetches `<base>/agent-manifest.json`, and picks the entry whose `name`
**exactly** equals the segment, else fails (`runtime/engine.js` `resolveRemote`).

Minimum network content (§2.1): network name + description + front agent; each agent has a
unique name, `function.description`, `instructions` if it uses an LLM, `tools` list; JSON
Schema `function.parameters`; `llm_config` hints; private-context (`sly_data`) rules via
`allow.to_downstream.sly_data` / `allow.to_upstream.sly_data`.

The front agent is found by `find_front_man` (`runtime/generated/graph.gen.mjs`): the first
agent with `instructions` and no `class`/`toolbox`.

## 2. How the reference runtime is loaded

- **The runtime to vendor is `skills/agentify-website/runtime/`** (1.9 MB incl.
  `generated/agent-runner.bundle.js` 1.5 MB). Every `examples/*_agentified/runtime/` is a
  byte-identical copy (`diff -rq` shows no difference). It is nsDeploy's runtime at nsdeploy
  commit `53a787c` (2026-11-11) with agentic-web edits listed in `runtime/README.md`.
  **Licence: Apache-2.0**, `runtime/LICENSE.txt`. The skill says: copy it unchanged, do not
  edit, do not install nsdeploy.
- A page loads it as an ES module, no bundler:
  ```js
  const { boot } = await import("./runtime/index.js");
  const booted = await boot("#agent-app", {
    originUrl: siteBase,
    sandboxWorkerUrl: new URL("runtime/sandbox-worker.js", siteBase).href,
  });
  ```
  (`skills/agentify-website/templates/site.js`). `boot()` reads the saved BYOK profile
  (`runtime/byok.js`), builds an `Engine`, calls `engine.loadTop()` (fetch manifest →
  `networks[0]` → fetch network file + `links.json` → parse → **validate before any model
  call** → choose router), then `mountApp()` renders the chat, the "⚙ AI model settings"
  BYOK panel, the agents panel and consent cards (`runtime/ui.js`). It returns
  `{ engine, trace, actions }` and sets `window.__nsweb`.
- `index.js` also exports `Engine`, `TraceBus`, `mountApp`, `AgentNetwork`,
  `validateNetwork`, `parseHocon`, `ActionRegistry` — so a page can drive the engine
  directly and a checker can validate networks with the exact same code.
- **Important for us:** the stock chat (`ui.js` line ~637) always calls
  `engine.streamTurn(text, { slyData: { backend_token: "demo-customer-token-123" } })`, so a
  page that wants to pass its own private context must call
  `engine.runTurn(text, { slyData })` itself. Both can share one engine.
- Model calls: `runtime/llm.js` `LlmClient` → OpenAI-compatible `/chat/completions` on the
  active router, key in `Authorization` only. The router comes from `selectTopRouter`
  (`engine.js`): BYOK key present → `llm_router.byok_router` (or the visitor's chosen
  provider URL); no key → `llm_router.base_url`.

## 3. How cross-site links and consent work in the reference implementation

Flow for a tool reference that is a peer (`runtime/runner.js` `dispatchToolCall`, kind
`remote`, and `runtime/engine.js`):

1. **Advertise without contact.** `buildToolTable` gives the model a generic
   `{request: string}` schema named after the URL's last segment; label from the network's
   top-level `link_labels[url]`. Nothing is fetched yet.
2. **Consent first.** If the peer origin differs from the caller's
   (`requiresThirdPartyApproval`), `engine.requestConsent({kind:"network", peerLabel,
   peerOrigin, requestText, est})` → page hook `engine.onConsent(info)` returning
   `"allow" | "always" | "decline"`. "always" is remembered per origin for the page
   lifetime. Decline returns the text `The user declined to contact <host>...` to the model.
   **With no hook attached the engine defaults to allow** (headless) — our pages must
   always attach one.
3. **Budget.** `consumeRemoteBudget`: per visitor turn max 4 remote calls, 1 per peer
   network, 24 agent calls, 90 s deadline (`engine.js` `runTurn`); nesting depth ≤ 5 and
   cycle detection in `RemoteRegistry` (`remote.js`).
4. **Policy gate.** `_assertAllowedPeer`: peer origin must be in the calling manifest's
   `allowed_peers` (mode `closed`) or in `engine.runtimeAllowedPeers` (origins the visitor
   linked explicitly), else `Policy: <host> is not in <network>'s allowed_peers`.
5. **Fetch + validate + compile.** `fetchManifest` → exact-name match → fetch network →
   `_loadPublishedLinks` → `validateNetwork` (throws on errors) → `selectPeerRouter`:
   **the peer always runs on the caller's router and key**; its manifest's `llm_router` is
   ignored. Model = visitor's model or the caller front agent's model; step limit = caller's.
6. **Private context.** The request sent to the peer is
   `{ user_message: requestText, sly_data: filterSlyData(ctx.slyData,
   callerFrontAgent.allow.to_downstream.sly_data), chat_filter: MINIMAL }` — **deny by
   default, only named keys cross**. The trace records it with values redacted
   (`redactSlyData`). Peer coded tools then get only the keys their own
   `allow.to_downstream.sly_data` names.
7. **Result.** Peer front agent's answer returns as a normal tool result; errors become
   `Error from <host>: ...` (fail closed, reported to the invoking network).

**Link slots (symbolic references) and visitor overrides** (`engine.js` `resolveLink`,
`kernel.js` `AgentNetwork`):

- A HOCON `link_slots: { "<ref>": {...} }` block makes a bare name in `tools` a *link*
  instead of a missing tool (validation ignores the missing reference).
- Resolution order: `network.getLink(ref)` (HOCON `links` merged with published
  `links.json`) **then** localStorage key `nsdeploy-link-v1::<base>::<network>::<ref>`
  **then** `engine.onLinkRequired()` (stock UI asks the visitor for a URL, then
  `_normalizeLinkTarget` fetches that site's manifest to validate it and the origin is added
  to `runtimeAllowedPeers`).
- Consequence: **a published `links.json` binding beats a stored visitor override.** To let
  a visitor swap a publisher-bound slot, page code must call
  `engine.top.network.setLink(ref, url)` (allowed only for declared slots) and add the
  origin to `engine.runtimeAllowedPeers` after `loadTop()`, re-applying the stored override
  on each load. No runtime edit is needed.
- The skill's own guidance says "never use `link_slots` for a partner" because an unbound
  slot makes the stock chat ask for a URL. We *want* a slot (that is the swap), and we keep
  it always bound (publisher default), so the stock prompt never appears.

**Loopback host names.** On `localhost`/`127.0.0.1`/`[::1]` the runtime mirrors saved BYOK
profiles into a cookie per host name (all ports). The reference linking tests therefore run
the three sites on **three host names**: `127.0.0.1`, `localhost`, `[::1]`
(`tests/linking/README.md`). Different ports on one host name would leak the key cookie to
the peer.

## 4. Mock / sample LLM support

Yes, built in:

- Manifest `llm_router: { "base_url": "browser://mock", "mock": true, "byok_router": "<real router>" }`
  → `LlmClient` uses `browserMockCompletion` (`runtime/llm.js`), fully offline, no key.
- Behaviour is deterministic but naive: per agent, **call each available tool once in
  order** (spec `tools` order first, then `website_*` actions, then `render_cruse`), filling
  every required string argument with the last user message; then answer
  `(mock summary) Based on the tools I consulted: <tool results, 1200 chars>`.
- A peer loaded during a mock session also runs on the mock (`selectPeerRouter`).
- Consequence for design: in sample mode the *quality* must come from deterministic tools
  (coded tools / site actions), and the page should render structured results from the
  trace rather than the mock's prose. Tool order in `tools` is the script.
- `cruse` should stay off: the mock would call `render_cruse` with a string `presentation`.
- Reference tests use a scripted router instead (`tests/linking/chrome/mock_router.mjs`,
  `templates/tests/scripted_model.mjs`).

## 5. Other runtime facts we rely on

- **Coded tools** (`class: "Name"` agents): bundle from `manifest.coded_tools.bundle`
  (+ optional `integrity` `sha256-…`), fetched host-side, imports rejected, run in a module
  worker with network APIs removed and the CSP above. Tool class exposes
  `invoke(args, sly)` / `asyncInvoke`. Gets only `allow.to_downstream.sly_data` keys; may
  write back only keys declared in `function.sly_data_output_schema.properties`.
  15 s timeout. A peer's bundle runs in the caller's worker — this is how a peer can read
  structured, allow-listed private context without any of it entering a prompt.
- **Site actions** (`actions.module`, `actions.agentTools`): `website_<name>` tools for the
  top network only; every agent in the network sees every one; `irreversible` asks first.
- **Trace bus** (`runtime/trace.js`): spans `compile`, `run`, `agent`, `tool_call`,
  `remote_fetch` (with `fetchedUrls`), `remote_call` (with redacted `requestPayload`),
  notes `consent`, `link`, `composition_limit`. Good for a visible "boundary log".
- **Validation** is the cross-compiled Neuro SAN validator
  (`runtime/generated/validation.gen.mjs`), reusable from Node and from a page.
- Node tooling in the skill (not vendored, only for reference):
  `scripts/serve_site.mjs` (CORS on public files + worker CSP), `scripts/build_network.mjs`
  (HOCON → JSON + checks), `scripts/check_partner.mjs` (partner checks).

## 6. Prior art in the community list (`docs/agentic_websites.md`)

Agent Atlas (directory + conformance/trust checker), NandaSeal (signing + conformance audit),
Agent Customs (peer instruction inspection). A plain "is this site conformant?" checker is
already taken. Our community tool must differ: **slot-contract compatibility** — "can this
network be dropped into *my* link slot?" (accepted private-context fields, input schema,
exact-name resolution, CORS, validation), with a one-click swap when it passes.

## 7. Spike results

- **Task 3, cross-origin peer load (passed).** With `test_planner` as a link slot bound by
  `links.json`, `engine.onConsent` fires with `peerOrigin: "localhost:5174"` while the
  5174 server has logged zero requests. After Allow, 5174 serves `agent-manifest.json`,
  `test_planner.network.json` and `links.json`, all with `auth=no cookies=none`. Decline
  produces zero 5174 requests. No fallback needed (`tests/e2e/spike-peer.spec.mjs`).
- **Task 4, sly_data across the boundary (passed, nested variant ships).** With
  `spec_lead → criteria_writer → criteria_drafter`, the drafter's `acceptance_criteria`
  write merges up to `spec_lead`; `remote_call.requestPayload.sly_data` has exactly
  `acceptance_criteria, feature_title, platform`, and the peer's `PlanBuilder` receives
  exactly those keys. `customer_name` and `internal_notes` never cross. The flat variant
  also passes (`tests/e2e/spike-sly.spec.mjs`).
