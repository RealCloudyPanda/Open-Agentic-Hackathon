# Submission pack: Cognizant Open Agentic Web Challenge

Implementation evidence update (2026-11-21): a shared extraction pipeline produces source-linked requirements and suggested checks, which the visitor edits and explicitly approves before a separate planner handoff. Review exports preserve actual results, failures and stale warnings. Standalone checker and runtime policy drills work locally. Static packages validate and run relay/swap under three HTTPS origins in local browser transport fixtures. These checks do not establish public hosting, real model performance or full conformance; the site-action bridge remains pending.

Draft for the owner. Nothing here has been submitted. Rules checked on cognizant-agenticweb.devpost.com on 2026-11-21.

## Rules that matter (as read on 2026-11-21)

| Item | What the rules say | Status |
| --- | --- | --- |
| Deadline | **Mon Jan 11 2027, 8:00 AM PT (11:00 AM ET)**. Judging Jan 11–18; winners around Jan 19. | Aim to submit by **Fri Jan 8**. |
| Eligibility | Age of majority where you live. Quebec excluded. | Owner to confirm. |
| Public site URL | The URL of your **public** open agentic website, with: a conforming `.json` agent network, a runtime that runs it in the browser, an interface to interact with it, optionally an LLM/key settings UI, and a network that can interact with the site and optionally other agentic sites. | **Blocker.** All three sites run only on loopback today. The static packager is implemented, regenerates integrity digests and passes local packaged three-origin browser verification; actual hosting still needs three public HTTPS origins with the CORS and worker CSP headers that `server/serve.mjs` sets. |
| Publicly accessible | "Must be publicly accessible, run consistently in a current web browser." | Same as above. |
| Video | **Less than 2 minutes**, public on YouTube, shows the project running in a browser, **with the entrant explaining it**, no third-party trademarks or copyrighted music without permission. | Not recorded. Script below runs 1:50, narrated by you. |
| Screenshots | One or more required. | Five in `docs/images/`. |
| Community tools | Optional; tools shared with the community count toward Potential Impact. | The compatibility checker (an ES module, inside the swap sheet, and a Node CLI). |
| Judging (equally weighted) | Technological Implementation (use of the open agentic web spec), Design, Potential Impact, Quality of the Idea. | |

## Video script (target 1:50, under 2:00, your own voice)

Record on the **public** URLs once deployed (or loopback if you must, but say so). 1440×900, zoom 110%, terminal on the right third for 1:00–1:15. Every origin on screen must be the real one.

| Time | Screen | Narration (you read it) |
| --- | --- | --- |
| 0:00–0:15 | Consent card mid-relay: origin, purpose, the exact request, fields that cross and stay. Click **Allow**. | "Before my private spec goes anywhere, the runtime stops and tells me which site, why, and exactly which fields cross. The customer's name and our internal notes never do." |
| 0:15–0:28 | Spec Desk hero with three origin stamps. | "This is Spec Relay: three separate agentic websites. Their agent networks are published as open files, so any site can run them in your browser." |
| 0:28–0:43 | Intake and ledger; **Run relay**; criteria card. | "I paste a feature request. Spec Desk's agents draft acceptance criteria right here. This is sample mode: no AI key, fully deterministic." |
| 0:43–1:00 | Timeline: manifest, network, links and tool bundle fetched from the planner's origin; plan card stamped with that origin. | "Spec Desk fetched the planner's published network and ran it here, on my own model router." |
| 1:00–1:15 | Boundary receipt next to the planner's server log line. | "The receipt and the planner's own server log agree: it got the criteria, not the customer or the notes, and never my key." |
| 1:15–1:35 | **Swap** → Risk Radar → **Check compatibility** (twelve checks pass) → **Use this planner** → run. Risk matrix stamped with the third origin. | "Now I swap the planner by URL. The checker reads Risk Radar's public files, it passes, and the next run uses a different site, without changing Spec Desk's code." |
| 1:35–1:50 | Terminal: `node tools/peer-check.mjs` against the planner URL, all checks passing. End card with the Spec Desk URL. | "The same checker is open source as a module and a command-line tool, so any agent site can test whether a peer fits before trusting it." |

## Devpost text

**Project name:** Spec Relay

**Elevator pitch** (≤200 chars):

> Hand a spec to another site's agents without handing over your secrets, then swap that site out by URL. Three open agentic websites, a consent card, and a field-level ledger.

**About the project** (Devpost's markdown field):

```markdown
## The problem
A product engineer has a feature request plus context that must not leave the team: the customer's name
and internal notes. They want acceptance criteria and a test plan. Today they paste everything into
whichever AI tool is open, and they can't change that tool without re-integrating it.

## What it does
Spec Relay is three independent open agentic websites. **Spec Desk** turns a feature request into acceptance
criteria with its own agent network. When it needs a test plan, it loads **Test Planner**'s published network
from another origin and runs it in your browser, on your own model router, after a consent card names the
origin, the purpose and the exact request. A handoff ledger shows which private-context fields cross (the
criteria, title and platform) and which never leave (customer name, internal notes); the runtime's published
`sly_data` allow rule enforces it, and a boundary receipt records it. Then swap the planner for **Risk
Radar**, a differently shaped network on a third origin, by pasting its URL. A slot-contract compatibility
checker reads its public files first, and Spec Desk's code and published files never change.

## How I built it
On the Worldwide Agentic Web MVP spec (Profile 0.3) and its reference nsDeploy browser runtime, vendored
unmodified (Apache-2.0). Each site publishes `agent-manifest.json`, a network JSON built from canonical Neuro
SAN HOCON by the runtime's own validator, `links.json`, and a sandboxed coded-tool bundle with an SRI digest,
all served with CORS. A keyless Sample mode uses the runtime's `browser://mock` router, so every screen is
clickable without a key; a live provider key can be entered in the runtime's own settings.

## Community tool
The slot-contract compatibility checker ships as an ES module (used inside the swap sheet) and a Node CLI
(`tools/peer-check.mjs`), so any agent site can test whether a peer fits its link slot.

## Challenges
Keeping a visitor's key away from peers: the runtime mirrors BYOK profiles into per-host cookies on loopback,
so the three sites use three host names, not three ports. Peer networks always run on the caller's router.

## What's next
[[OWNER: from your own judgement, e.g. more peer planners, publishing the checker to npm.]]

## Built with AI assistance
Planning, code and docs were drafted with AI coding assistants under my direction and checked by running
the unit and browser tests. [[OWNER: name the assistants you used.]]
```

**Built with:** `javascript` · `html` · `css` · `node.js` · `nsdeploy-runtime` · `neuro-san-hocon` · `playwright`

**Try it out:** [[public Spec Desk URL]] · `https://github.com/RealCloudyPanda/Open-Agentic-Hackathon`

**Significant update statement** (if asked): the project was created during the submission period; first commit 2026-11-20.

## Before you press submit
- [ ] Static build written (not built yet), three sites on three distinct public HTTPS origins, `publicOrigin` filled in `sites.config.json`, CORS and worker CSP headers checked.
- [ ] Checker run against all three public network URLs; all Compatible.
- [ ] Sample mode works end to end on the public URLs with no key.
- [ ] Video under 2:00, your own voice, public on YouTube.
- [ ] Every `[[OWNER]]` line replaced or removed.
- [ ] Submit by Jan 8; the deadline is Jan 11, 11:00 AM ET.
