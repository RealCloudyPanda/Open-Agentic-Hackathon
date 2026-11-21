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
