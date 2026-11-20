# 2. Share structured fields as private context, never in prompt text

Status: accepted

The fields a visitor may share (`acceptance_criteria`, `feature_title`, `platform`) travel
as `sly_data`, filtered by Spec Desk's published `allow.to_downstream.sly_data`, and the
peer reads them in a sandboxed coded tool; withheld fields (`customer_name`,
`internal_notes`) are passed to the turn but never cross. This makes the peer's planner a
coded tool rather than pure prompting, and the model-written request text still needs a
page-side leak guard, but the field boundary is enforced by the runtime, not by asking a
model nicely.
