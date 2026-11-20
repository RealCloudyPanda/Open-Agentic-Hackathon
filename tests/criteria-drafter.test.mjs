import { test } from "node:test";
import assert from "node:assert/strict";
import { draftCriteria, CriteriaDrafter } from "../sites/spec-desk/tools/criteria-drafter.js";

export const SAMPLE = {
  feature_request: "Add undo and redo to our collaborative document editor. Undo must only revert my own edits.",
  feature_title: "Undo/redo",
  platform: "Web (React, CRDT sync)",
  internal_notes: "Pilot threatened to churn over lost edits. Do not share outside the team.",
};

test("deterministic", () => {
  assert.deepEqual(draftCriteria(SAMPLE), draftCriteria(SAMPLE));
});

test("undo sample yields 5-9 criteria including own-edits", () => {
  const { criteria } = draftCriteria(SAMPLE);
  assert.ok(criteria.length >= 5 && criteria.length <= 9, String(criteria.length));
  assert.ok(criteria.some((c) => /only my own edits/i.test(c.then)));
  assert.deepEqual(criteria.map((c) => c.id), criteria.map((_, i) => `AC-${i + 1}`));
});

test("internal notes raise risk but are never copied", () => {
  const out = JSON.stringify(draftCriteria(SAMPLE));
  assert.ok(out.includes("data-loss-risk"));
  const words = SAMPLE.internal_notes.toLowerCase().replace(/[^a-z ]/g, "").split(/\s+/);
  for (let i = 0; i + 5 <= words.length; i++) {
    assert.ok(!out.toLowerCase().includes(words.slice(i, i + 5).join(" ")), words.slice(i, i + 5).join(" "));
  }
});

test("unknown topic yields the 4 generic criteria", () => {
  const { criteria } = draftCriteria({ feature_request: "Make the dashboard nicer." });
  assert.equal(criteria.length, 4);
  assert.deepEqual(criteria.map((c) => c.tags[0]), ["happy-path", "validation", "accessibility", "persistence"]);
});

test("tool writes acceptance_criteria and falls back to request text", () => {
  const sly = {};
  const out = new CriteriaDrafter().invoke({ request: "Add search" }, sly);
  assert.deepEqual(sly.acceptance_criteria, out.criteria);
  assert.ok(out.topics.includes("search"));
});
