# Submission pack: Cognizant Open Agentic Web Challenge

Draft for the owner. Nothing here has been submitted. Rules checked on cognizant-agenticweb.devpost.com on 2026-11-21.

## Rules that matter (as read on 2026-11-21)

| Item | What the rules say | Status |
| --- | --- | --- |
| Deadline | **Mon Jan 11 2027, 8:00 AM PT (11:00 AM ET)**. Judging Jan 11–18; winners around Jan 19. | Aim to submit by **Fri Jan 8**. |
| Eligibility | Age of majority where you live. Quebec excluded. | Owner to confirm. |
| Public site URL | The URL of your **public** open agentic website, with: a conforming `.json` agent network, a runtime that runs it in the browser, an interface to interact with it, optionally an LLM/key settings UI, and a network that can interact with the site and optionally other agentic sites. | **Blocker.** All three sites run only on loopback today. There is no static build yet (`scripts/build-static.mjs` from the plan isn't written), and hosting needs three public HTTPS origins with the CORS and worker CSP headers that `server/serve.mjs` sets. |
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
