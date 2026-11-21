import test from 'node:test';
import assert from 'node:assert/strict';
import { relayMarkdown } from '../shared/export.js';
import { draftCriteria } from '../sites/spec-desk/tools/criteria-drafter.js';
test('requirements point to exact input slices and suggestions remain labelled', () => {
  const feature_request = '  Search must preserve case.\nExport must include all rows!';
  const out = draftCriteria({ feature_request });
  for (const r of out.requirements) assert.equal(feature_request.slice(r.source.start, r.source.end), r.text);
  assert.ok(out.criteria.every((c) => c.status === 'suggested_check'));
});
test('Markdown retains absent-plan failure and actual reviewed case details', () => {
  assert.match(relayMarkdown({ failure: 'Declined', receipt: { declined: true } }), /Plan not produced[\s\S]*Declined/);
  const text = relayMarkdown({ stale: true, approvedCriteria: [{ id: 'AC-X', title: 'Edited source' }], plan: { plan: { cases: [{ id: 'TC-X', criterion: 'AC-X', title: 'Actual', steps: ['Click edited control'], expected: 'Edited result' }] } } });
  for (const expected of ['Stale', 'AC-X', 'Click edited control', 'Edited result']) assert.ok(text.includes(expected));
});

test('exports planning metadata and actionable risk charter details', () => {
  const text = relayMarkdown({ criteria: { open_questions: ['How long is undo history?'] }, consentLog: [{ decision: 'allowed', origin: 'planner.example', time: '12:00' }], plan: { kind: 'risk_plan', origin: 'radar.example', criteria_source: 'shared acceptance_criteria', received_fields: ['acceptance_criteria'], risks: [{ id: 'R-1', area: 'History', priority: 'P1', impact: 3, likelihood: 2, score: 6, criteria: ['AC-1'] }], charters: [{ id: 'CH-1', mission: 'Exercise undo', timebox_min: 60, priority: 'P1', risks: ['R-1'], criteria: ['AC-1'] }] } });
  for (const expected of ['not been executed', 'How long', 'radar.example', 'impact 3 × likelihood 2 = 6', 'Timebox: 60 min', 'risks R-1', 'criteria AC-1', 'allowed planner.example']) assert.ok(text.includes(expected), expected);
});
test('partial risk output remains exportable without charters', () => {
  assert.match(relayMarkdown({ plan: { risks: [] } }), /charters not produced/);
});
test('exports case type priority coverage and platform follow-up', () => {
  const text = relayMarkdown({ plan: { plan: { cases: [{ id: 'TC-1', criterion: 'AC-1', title: 'Test', type: 'edge', level: 'e2e', priority: 'P1', steps: ['Act'], expected: 'Works' }], coverage: { 'AC-1': ['TC-1'] }, platform_notes: ['Use two clients'] } } });
  for (const expected of ['edge; e2e; P1', 'AC-1: TC-1', 'Use two clients']) assert.ok(text.includes(expected));
});
