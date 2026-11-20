import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan, parseCriteriaText, PlanBuilder } from "../sites/test-planner/tools/plan-builder.js";
import { draftCriteria } from "../sites/spec-desk/tools/criteria-drafter.js";

const criteria = draftCriteria({ feature_request: "Add undo and redo to our collaborative editor.", internal_notes: "lost edits" }).criteria;
const sly = { acceptance_criteria: criteria, feature_title: "Undo/redo", platform: "Web (React, CRDT sync)" };

test("3 cases per criterion and full coverage", () => {
  const { plan } = buildPlan(sly);
  assert.equal(plan.cases.length, criteria.length * 3);
  for (const c of criteria) assert.equal(plan.coverage[c.id].length, 3);
  assert.deepEqual(new Set(plan.cases.map((c) => c.type)), new Set(["positive", "negative", "edge"]));
  assert.ok(plan.platform_notes.length >= 2);
});

test("received_fields lists exactly the keys given", () => {
  assert.deepEqual(buildPlan(sly).received_fields, ["acceptance_criteria", "feature_title", "platform"]);
  assert.deepEqual(buildPlan({ acceptance_criteria: criteria }).received_fields, ["acceptance_criteria"]);
});

test("deterministic", () => {
  assert.deepEqual(buildPlan(sly), buildPlan(sly));
});

test("text fallback parses AC lines when sly_data is empty", () => {
  const out = new PlanBuilder().invoke({ request: "Plan these:\nAC-1: Undo works\n- AC-2: Redo works" }, {});
  assert.equal(out.criteria_source, "request text");
  assert.deepEqual(Object.keys(out.plan.coverage), ["AC-1", "AC-2"]);
  assert.deepEqual(out.received_fields, []);
});

test("parseCriteriaText falls back to lines", () => {
  assert.deepEqual(parseCriteriaText("Undo works\nRedo works").map((c) => c.id), ["AC-1", "AC-2"]);
});
