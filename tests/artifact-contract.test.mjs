import test from 'node:test';
import assert from 'node:assert/strict';
import { artifactsFrom } from '../shared/trace-artifacts.js';
test('alternative fixture tool names produce contract artifacts', () => {
  const events = [{ seq: 1, kind: 'tool_call', phase: 'end', status: 'ok', tool: 'DifferentPlanner', origin: 'third.example', result: { plan: { cases: [{ id: 'TC-1', steps: ['Open'], expected: 'Visible' }], platform_notes: [] } } }];
  assert.equal(artifactsFrom(events).plan.origin, 'third.example');
  assert.equal(artifactsFrom(events, { since: 1 }).plan, null);
});
test('malformed and failed tool outputs are not successful plans', () => {
  for (const result of [{ plan: { cases: [null], platform_notes: [] } }, { plan: { cases: [] } }]) {
    assert.equal(artifactsFrom([{ kind: 'tool_call', phase: 'end', status: 'ok', result }]).plan, null);
  }
});
