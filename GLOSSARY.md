# Glossary

**Agent site** — A web origin (or subpath) that publishes one or more agent networks and the
files needed to run them. Spec Desk, Test Planner and Risk Radar are each an agent site.
_Avoid_: app, server, service.

**Agent network** — A named graph of agents with their instructions, input schemas and tools,
published as data. _Avoid_: bot, workflow, pipeline.

**Front agent** — The one agent of a network that callers talk to. _Avoid_: main agent,
entry bot, orchestrator.

**Caller site** — The site the visitor is using when a handoff starts (Spec Desk).
_Avoid_: host, client, parent site.

**Peer site** — Another agent site whose network the caller loads and runs in the visitor's
browser. _Avoid_: remote agent, partner API, backend.

**Handoff** — One call from the caller's network to a peer network, carrying a request and
the allowed private context. _Avoid_: delegation (reserved for agents inside one network),
API call, sync.

**Feature request** — The visitor's plain-language description of what they want built.
_Avoid_: ticket, story, prompt.

**Acceptance criteria** — The checkable conditions, in Given/When/Then form, that a feature
must meet. _Avoid_: requirements, specs, ACs (in UI text).

**Test plan** — The ordered set of test cases or charters a planner produces from acceptance
criteria. _Avoid_: test suite, QA report.

**Private context** — Structured fields that travel beside a request but outside its text
(the spec's `sly_data`). _Avoid_: metadata, hidden prompt, secrets.

**Allow rule** — A network's published list of private-context fields that may cross to the
next network. _Avoid_: whitelist, permission, filter.

**Handoff ledger** — The visitor-facing list of private-context fields with where each one
ends up: crosses, kept here by you, or never leaves. _Avoid_: share settings, privacy panel.

**Consent card** — The prompt that names the peer origin and the purpose of the contact and
waits for the visitor's decision before anything is fetched. _Avoid_: popup, permission
dialog, warning.

**Leak guard** — The caller page's check that a handoff request does not contain the value
of a withheld field. _Avoid_: DLP, scanner, redactor.

**Boundary receipt** — The after-the-fact record of what crossed to a peer: origins
contacted, files fetched, field names sent, router used. _Avoid_: audit log, trace dump.

**Link slot** — A named placeholder in a network (`test_planner`) that resolves to a peer
network URL at run time. _Avoid_: plugin point, integration, connector.

**Publisher binding** — The link slot's default peer URL, published by the caller site in its
links file. _Avoid_: hard-coded peer, default config.

**Visitor binding** — A link slot URL chosen by the visitor and stored only in their browser,
which replaces the publisher binding for them. _Avoid_: override file, custom link.

**Swap** — Replacing a slot's binding with another compatible peer by URL, with no change to
the caller site's code or published files. _Avoid_: hot-swap, plugin install, migration.

**Slot contract** — What a link slot sends and expects: the private-context fields it
forwards and the kind of answer it wants. _Avoid_: interface, API spec, schema (alone).

**Compatibility check** — Verifying that a candidate peer network can fill a given slot:
published, valid, reachable from the caller, and able to accept the slot contract.
_Avoid_: conformance audit, trust score, certification.

**Sample mode** — Running with no AI key: the runtime's built-in offline mock model plus
deterministic tools. Always labelled on screen. _Avoid_: demo mode, fake mode, offline AI.

**Live mode** — Running with the visitor's own model provider key. _Avoid_: real mode,
production mode.

**Router** — The inference endpoint the caller site uses for every model call, including
peers' calls. _Avoid_: LLM server, AI backend, proxy.

**Conformance drill** — A scripted run that makes the runtime refuse something on purpose
(invalid network, cycle, budget, denied origin) and shows the refusal. _Avoid_: test case
(in UI text), chaos test.
