# 3. Sample mode is the runtime's own `browser://mock` plus deterministic tools

Status: accepted

With no key, all three sites declare `llm_router.base_url = "browser://mock"`; the mock
calls each tool once in `tools` order, so the order of a network's `tools` list is part of
the design and the visible quality comes from deterministic coded tools, rendered from the
trace. We rejected a custom scripted router (service worker or server endpoint) because it
would break static hosting or add a second untested code path; the cost is that sample-mode
prose is crude and is hidden behind structured cards.
