# Spec Relay — build plan

Read first: `docs/SPEC.md` (what), `docs/RESEARCH.md` (runtime facts), `docs/adr/`,
`GLOSSARY.md` (UI words). Common rules: one commit per task (conventional message, no AI
trailers, no `--no-verify`, do not push), never edit `vendor/nsdeploy-runtime/`, no env vars,
no database, Node 22, `npm install` + `npm start`.

REFS (reference clone) =
`/private/tmp/claude-501/-Users-shmy-Downloads-Coding-Journey-Nov-Hackathons/6c7e88a0-eae9-4558-ace9-ae604e08910a/scratchpad/refs/cognizant-ai-labs_agentic-web`
(scratch location: if it is gone, re-clone `https://github.com/cognizant-ai-labs/agentic-web`
at commit `0516537`).

Design refs to apply from task 9 on: `REFS/../pbakaus_impeccable/.github/skills/impeccable/SKILL.md`,
`REFS/../emilkowalski_skills/skills/emil-design-eng/SKILL.md`,
`REFS/../jakubkrehel_skills/skills/better-ui/SKILL.md` and `better-interface/SKILL.md`.

Riskiest work is first. Tasks 3 and 4 are go/no-go spikes: if one fails, apply its fallback,
note the result in `docs/RESEARCH.md` §7 "Spike results", and continue.

## Phase A — prove the runtime path (risk first)

**1. Scaffold and vendor the runtime** — `chore: scaffold workspace and vendor reference runtime`
- Files: `package.json` (type module; scripts `start`, `test`, `test:e2e`,
  `build:networks`, `build`, `check:peer`; devDependency `playwright` ^), `sites.config.json`
  (ids, folders, ports, local origins, empty public origins), `vendor/nsdeploy-runtime/`
  (copy of `REFS/skills/agentify-website/runtime/`, unchanged, incl. `LICENSE.txt` and
  `generated/`), `vendor/nsdeploy-runtime.PROVENANCE.md` (source repo, commit `0516537`,
  nsdeploy `53a787c`, licence Apache-2.0, "do not edit").
- Check: `diff -rq REFS/skills/agentify-website/runtime vendor/nsdeploy-runtime` prints
  nothing; `npm install` succeeds.

**2. Three-origin dev server** — `feat: serve three sites with spec hosting headers`
- Files: `server/serve.mjs`, `tests/server.test.mjs`, placeholder
  `sites/{spec-desk,test-planner,risk-radar}/index.html`.
- Behaviour per SPEC §9 (listeners `127.0.0.1:5173`, `127.0.0.1:5174` printed as
  `localhost`, `::1:5175`; `/runtime/` and `/shared/` mounts; CORS only on public
  artifacts; worker CSP; no-store; traversal refused; one-line request log with
  `from=`, `auth=yes|no`, cookie names only).
- Check: `node --test tests/server.test.mjs` asserts CORS header present on
  `agent-manifest.json` and absent on `index.html`, CSP on `/runtime/sandbox-worker.js`,
  404 on `/../package.json`; `npm start` prints three URLs. If `::1` cannot bind, print a
  clear error and document it.

**3. Spike: cross-origin peer load in sample mode** — `test: prove cross-origin peer network load`
- Files: minimal hand-written `sites/spec-desk/{agent-manifest.json,links.json,spec_desk.network.json,index.html}`
  and `sites/test-planner/{agent-manifest.json,links.json,test_planner.network.json}`
  (LLM agents only, `browser://mock`), `tests/e2e/spike-peer.spec.mjs` (Playwright, starts
  the server).
- The page boots the runtime (`boot()` from `/runtime/index.js`), sets
  `engine.onConsent` to a test hook, and calls `engine.runTurn("hello")`.
- Check: test passes and asserts (a) the consent hook fires with `peerOrigin`
  `localhost:5174` **before** the server logs any request to 5174, (b) after allow, 5174
  logs `agent-manifest.json`, `test_planner.network.json`, `links.json` with `auth=no`,
  (c) the final answer contains the peer's mock summary, (d) declining causes zero 5174
  requests. Fallback: if the link slot path fails, put the peer URL directly in
  `spec_lead.tools` (remote kind) and defer swap to page-level `setLink` research.

**4. Spike: private context across the boundary with coded tools** — `test: prove sly_data allow rules reach peer coded tools`
- Files: tiny `sites/spec-desk/tools/criteria-drafter.js` (writes a fixed
  `acceptance_criteria`), `sites/test-planner/tools/plan-builder.js` (returns the keys it
  received), manifests gain `coded_tools`, `tests/e2e/spike-sly.spec.mjs`.
- Run with `slyData = { feature_request, feature_title, platform, customer_name, internal_notes }`.
- Check: peer tool result reports exactly `acceptance_criteria, feature_title, platform`;
  trace `remote_call.requestPayload.sly_data` keys equal that set; `customer_name` /
  `internal_notes` absent. Also run with the drafter nested under `criteria_writer`.
  Fallback: if nested merge fails, keep `criteria_drafter` directly in `spec_lead.tools`
  (record which variant shipped in RESEARCH §7 and SPEC §5.3).

**5. Network build script** — `feat: build resolved network JSON and SRI digests from HOCON`
- Files: `scripts/build-networks.mjs` (uses vendored `parseHocon`, `AgentNetwork`,
  `validateNetwork`; writes `<name>.network.json`; computes `sha256-` digest of each
  `tools/*.js` and writes `coded_tools.integrity` into the manifest; fails on validation
  errors, leftover `TODO`/`<...>`, manifest/network name mismatch, `link_slots` not in
  `linking.imports`), `--check` mode, `tests/networks.test.mjs`.
- Convert the spike networks to `spec_desk.hocon`, `test_planner.hocon`.
- Check: `npm run build:networks -- --check` exits 0; test validates every site's network
  with the vendored validator and asserts integrity digests match file contents.

## Phase B — the agents

**6. CriteriaDrafter** — `feat: add deterministic acceptance criteria drafter`
- Files: `sites/spec-desk/tools/criteria-drafter.js` (self-contained, no imports),
  `tests/criteria-drafter.test.mjs`, final `spec_desk.hocon` per SPEC §5.3.
- Check: same input → identical output (deep-equal twice); undo sample yields 5–9 criteria
  incl. "only my own edits"; `internal_notes` text never appears in output (assert no 5-word
  substring); unknown topic yields the 4 generic criteria.

**7. PlanBuilder and Test Planner network** — `feat: add Test Planner network and plan builder`
- Files: `sites/test-planner/tools/plan-builder.js`, `test_planner.hocon`, manifest,
  `tests/plan-builder.test.mjs`.
- Check: 3 cases per criterion, coverage maps every criterion, `received_fields` correct,
  text fallback parses "AC-1: …" lines when sly_data is empty; build `--check` passes.

**8. Risk Radar network and tools** — `feat: add Risk Radar alternative planner network`
- Files: `sites/risk-radar/tools/risk-charter.js` (exports `RiskProfiler`, `CharterBuilder`),
  `risk_test_planner.hocon`, manifest, `links.json`, `tests/risk-charter.test.mjs`.
- Check: deterministic scores (impact × likelihood), ≥ 1 charter per P1 risk, text
  fallback works; network differs in shape from `test_planner` (≥ 3 agents).

## Phase C — Spec Desk experience

**9. Design tokens and shared boot** — `feat: add paper-instruments design tokens and runtime boot helper`
- Files: `shared/tokens.css` (SPEC §10), `shared/boot-site.js` (boots runtime into a
  console drawer, exposes engine, renders mode badge "Sample mode · no AI key ·
  deterministic tools" / "Live · provider · model", page keeps working if boot fails).
- Check: all three placeholder pages show the badge in sample mode; with boot forced to
  fail (bad manifest URL) the page shows the fallback message, no uncaught error in console.

**10. Trace → artifacts and boundary receipt** — `feat: derive artifacts and boundary receipt from runtime trace`
- Files: `shared/trace-artifacts.js`, `tests/trace-artifacts.test.mjs`,
  `tests/fixtures/trace-relay.json` (recorded from the spike run).
- Check: from the fixture, extracts criteria (origin `127.0.0.1:5173`), plan (origin
  `localhost:5174`), contacted origins, fetched URLs, sly_data keys sent, router host,
  consent decision; no secret values ever appear in output (assert).

**11. Spec Desk layout, intake and handoff ledger** — `feat: build Spec Desk intake and handoff ledger`
- Files: `sites/spec-desk/{index.html,app.css,app.js}`, `sites/spec-desk/relay/ledger.js`,
  `tests/ledger.test.mjs`.
- Ledger reads the allow rule from the loaded network (not hard-coded) per SPEC §7.1.
- Check: tests for the three states, required field not toggleable, unticked field omitted
  from the built slyData; page renders at 1440×900 and 390×844 without overflow.

**12. Consent card and leak guard** — `feat: add origin and purpose consent card with leak guard`
- Files: `sites/spec-desk/relay/consent-card.js`, `tests/consent-card.test.mjs`.
- Check: card shows origin with scheme+port, purpose, full request text, crossing/staying
  fields, key line; leak guard blocks Allow when a withheld value (≥ 4 chars,
  case-insensitive) is in the request; Escape = Decline; focus starts on title and is
  trapped; returns `"allow"`/`"decline"` only.

**13. Relay timeline and result cards** — `feat: wire relay run with live timeline and result cards`
- Files: `sites/spec-desk/app.js`, `sites/spec-desk/relay/timeline.js`.
- Check (manual + e2e in task 21): Run relay in sample mode shows Draft → Consent → Fetch →
  Validate → Run → Receipt in order driven by trace events; criteria and plan cards carry
  origin stamps; Decline path shows "Nothing was sent"; a second run works without reload.

**14. Site action and bridge** — `feat: register get_intake site action and empty action bridge`
- Files: `sites/spec-desk/site-actions.js` (module format from
  `REFS/skills/agentify-website/templates/site-actions.js`),
  `sites/spec-desk/bridge/{action-bridge.html,agent-manifest.json}` (from the skill template;
  shares no actions; keep Apache-2.0 header and note it in PROVENANCE).
- Check: trace shows `website_get_intake` called and returning no private values; calling
  `http://127.0.0.1:5173/spec_desk` from Test Planner's page (temporary test) loads the bridge
  without the 10 s wait.

**15. Swap: visitor binding** — `feat: swap the test planner by URL with a visitor-owned binding`
- Files: `sites/spec-desk/relay/binding.js`, swap sheet in `app.js`/`index.html`,
  `tests/binding.test.mjs`.
- Uses runtime key format `nsdeploy-link-v1::<base>::spec_desk::test_planner`; re-applies
  after each load with `network.setLink` + `runtimeAllowedPeers`; Reset removes it.
- Check: unit test that apply/reset never writes `links.json` (file hash unchanged) and that
  a non-slot reference is refused; manual: swap to Risk Radar, reload, chip still shows
  "your choice".

## Phase D — community tool and conformance proof

**16. Compatibility checker core** — `feat: add slot-contract compatibility checker module`
- Files: `shared/peer-check.js` (isomorphic; takes `fetch` + caller origin + optional slot
  contract; runs SPEC F4 checks 1–12; uses vendored parser/validator),
  `tests/peer-check.test.mjs` with a stub fetch over local fixture folders.
- Check: Test Planner and Risk Radar → Compatible; `/nope` → fail on check 4; a fixture
  missing CORS → fail on check 2; missing SRI → warn; JSON report shape stable.

**17. Checker page and CLI** — `feat: add compatibility checker page and CLI`
- Files: `sites/spec-desk/{checker.html,checker.js}`, `tools/peer-check.mjs`, wire the swap
  sheet's "Check compatibility" to the module with the consent card ("Read public files …
  Nothing is run.").
- Check: `node tools/peer-check.mjs http://localhost:5174/test_planner --origin http://127.0.0.1:5173`
  exits 0 with a table; `--json` prints valid JSON; page shows verdict and enables "Use this
  planner" only when no fails.

**18. Test Planner standalone page** — `feat: build Test Planner standalone page`
- Files: `sites/test-planner/{index.html,app.css,app.js,favicon.svg}`.
- Check: paste criteria → plan table in sample mode; "Published network URL" copy button;
  list of public files with links; blueprint accent.

**19. Risk Radar standalone page** — `feat: build Risk Radar standalone page`
- Files: `sites/risk-radar/{index.html,app.css,app.js,favicon.svg}`.
- Check: risk matrix (3×3 grid, accessible table equivalent) + charters; ochre accent.

**20. Conformance drills** — `feat: add conformance drills for invalid, cycle, budget and denied peers`
- Files: `sites/risk-radar/drills/{invalid,cycle,budget}/…`, `sites/spec-desk/{drills.html,drills.js}`.
- Check: each drill shows the runtime's own refusal text (SPEC F5) and a "what the spec
  requires" line; the decline drill shows zero requests to the peer (read from the receipt).

**21. End-to-end suite** — `test: cover relay, decline, swap and drills end to end`
- Files: `tests/e2e/relay.spec.mjs`, `swap.spec.mjs`, `drills.spec.mjs`; remove or fold in
  the spike specs.
- Check: `npm run test:e2e` green headless; asserts: no peer request before Allow; peer
  receives exactly the allowed sly_data keys; unticking `platform` removes it; no request to
  any peer carries `Authorization` or cookies; swap changes the planner origin; drills show
  refusals.

## Phase E — polish and ship

**22. Live mode and design polish pass** — `style: polish layout, motion and accessibility`
- Apply impeccable critique → polish → audit, Emil motion rules, better-ui checklists.
  Confirm the default `llm_config.model_name` exists on OpenRouter (docs only; do not call
  it), check badge text in live mode by saving a dummy profile (no real key, expect the
  runtime's clear setup error on run), contrast ≥ 4.5:1 for all text, visible focus,
  `prefers-reduced-motion`.
- Check: axe-style manual checklist written into `docs/A11Y.md`; Playwright keyboard-only
  run of the relay passes (Tab to Run, Enter, card focus, Allow).

**23. Static build for public hosting** — `feat: add static build with headers for three public origins`
- Files: `scripts/build-static.mjs` (`--target local|public`; copies each site + runtime +
  shared into `dist/<site>/`; rewrites peer URLs, `allowed_peers` and drill URLs from
  `sites.config.json`; writes `_headers` with CORS + worker CSP), `docs/DEPLOY.md`
  (three Netlify or Cloudflare Pages projects; HTTPS required).
- Check: `npm run build -- --target local` then serving `dist/` with the dev server passes
  the e2e relay spec; `--target public` with empty public origins fails with a clear message.

**24. Screenshots** — `docs: add README screenshots`
- Files: `docs/images/{hero,consent,receipt,swap-checker,risk-plan,drills}.png` captured
  with Playwright (or headless Chrome) at 1440×900 in sample mode.
- Check: ≥ 5 PNGs, each < 600 KB, no personal data, fictional sample only.

**25. README** — `docs: write README with demo, proof table and AI disclosure`
- Sections per the common brief: pitch, hero image, problem, what it does, demo moment, how
  it works (Mermaid: browser ↔ three origins, router), sponsor tech and why necessary,
  quickstart (`npm install`, `npm start`, open `http://127.0.0.1:5173`), sample vs live,
  Judging → proof table (from SPEC §11–12), project structure, Known limitations (tab-scoped,
  static only, request text not filtered by the runtime, mock prose, IPv6 loopback needed
  locally, peers on public hosts need HTTPS, no cross-site writes), "How this was built"
  (AI-assisted development disclosed plainly), licences (MIT + Apache-2.0 runtime).
- Check: every command in Quickstart run once from a clean clone; all image links resolve;
  no invented metrics.

## Definition of done

`npm install && npm start` serves three sites; sample-mode relay, decline, swap, checker
and drills work with no key; `npm test` and `npm run test:e2e` pass; build `--check` passes;
README complete; 22–25 commits; nothing pushed.
