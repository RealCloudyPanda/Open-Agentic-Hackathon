# 1. Vendor the reference browser runtime unchanged

Status: accepted

We copy `skills/agentify-website/runtime/` from cognizant-ai-labs/agentic-web (commit
`0516537`, Apache-2.0) byte for byte into `vendor/nsdeploy-runtime/` and never edit it; all
Spec Relay behaviour (custom consent card, handoff ledger, visitor bindings) is page code
that calls the runtime's public objects (`Engine`, `onConsent`, `network.setLink`,
`runtimeAllowedPeers`). We accept 1.9 MB of vendored code and some reliance on
underscore-free internals in exchange for judges seeing the spec's own executable
behaviour, and for staying upgradable by re-copying the folder.
