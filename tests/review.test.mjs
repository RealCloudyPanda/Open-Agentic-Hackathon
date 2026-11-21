import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewedCriteria } from '../shared/review.js';
const row = { id: 'AC-1', title: 'Save', given: 'An edit', when: 'Save is pressed', then: 'The edit persists', priority: 'P1', tags: ['persistence'], requirement_ids: ['REQ-1'] };
const sources = [{ id: 'REQ-1' }];
test('review preserves the exact checked text for the approved payload', () => {
  const [result] = reviewedCriteria(JSON.stringify([row]), sources);
  assert.deepEqual(result, row);
});
test('review rejects incomplete, ambiguous or malformed handoffs', () => {
  for (const bad of [null, {}, [], [null], [row, row], [{ ...row, id: {} }], [{ ...row, title: {} }], [{ ...row, then: '' }], [{ ...row, tags: 'sync' }], [{ ...row, priority: 'P0' }], [{ ...row, requirement_ids: ['REQ-404'] }], [{ ...row, private_extra: 'secret' }]]) {
    assert.throws(() => reviewedCriteria(JSON.stringify(bad), sources));
  }
  assert.throws(() => reviewedCriteria('{broken'));
});
