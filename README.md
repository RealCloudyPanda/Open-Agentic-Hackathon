# Spec Relay

> Hand a spec to another site's agents without handing over your secrets — then swap that site out by URL.

Spec Relay is three independent open agentic websites built on the
[Worldwide Agentic Web MVP spec](https://github.com/cognizant-ai-labs/agentic-web) for the
Open Agentic Web Challenge:

- **Spec Desk** turns a feature request into acceptance criteria with its own agent network.
- **Test Planner** (another origin) publishes a network that turns acceptance criteria into a test plan.
- **Risk Radar** (a third origin) publishes a drop-in alternative planner.

Spec Desk loads the planner's published network into the visitor's browser, asks before
contacting it (origin + purpose), shows exactly which private-context fields cross the
boundary, and lets the visitor swap the planner by URL without changing Spec Desk's code.

Status: planning. See `docs/SPEC.md` and `docs/PLAN.md`.

## License

MIT for this project's code (see `LICENSE`). The vendored browser runtime in
`vendor/nsdeploy-runtime/` is Apache-2.0 (see its `LICENSE.txt`).
