# 4. A swap is a visitor binding applied by page code after load

Status: accepted

The runtime resolves a published `links.json` binding before any stored visitor binding,
so Spec Desk's page re-applies the visitor's stored binding with `network.setLink` and adds
its origin to `runtimeAllowedPeers` after every `loadTop()`, only after the candidate passed
the compatibility check. Publisher files stay untouched (spec §3.3), at the price of a
small dependency on how the runtime orders link resolution; a runtime upgrade must re-check
it (covered by a test).
