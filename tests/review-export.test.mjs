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
