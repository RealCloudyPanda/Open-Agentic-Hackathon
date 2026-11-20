import { test } from "node:test";
import assert from "node:assert/strict";
import { profileRisks, buildCharters, RiskProfiler, CharterBuilder } from "../sites/risk-radar/tools/risk-charter.js";
import { draftCriteria } from "../sites/spec-desk/tools/criteria-drafter.js";

const criteria = draftCriteria({ feature_request: "Add undo and redo to our collaborative editor.", internal_notes: "lost edits" }).criteria;
const sly = { acceptance_criteria: criteria, platform: "Web (React, CRDT sync)" };

test("scores are impact x likelihood and deterministic", () => {
  const a = profileRisks(sly);
  assert.deepEqual(a, profileRisks(sly));
  for (const r of a.risks) assert.equal(r.score, r.impact * r.likelihood);
});

test("at least one charter per P1 risk", () => {
  const { risks } = profileRisks(sly);
  const charters = buildCharters(risks);
  for (const r of risks.filter((x) => x.priority === "P1")) assert.ok(charters.some((c) => c.risks.includes(r.id)));
});

test("tools chain via risk_profile and text fallback works", () => {
  const s = { ...sly };
  const p = new RiskProfiler().invoke({ request: "" }, s);
  assert.deepEqual(p.received_fields, ["acceptance_criteria", "platform"]);
  assert.ok(Array.isArray(s.risk_profile));
  const c = new CharterBuilder().invoke({ request: "AC-1: Undo works offline" }, {});
  assert.ok(c.charters.length >= 1);
});
