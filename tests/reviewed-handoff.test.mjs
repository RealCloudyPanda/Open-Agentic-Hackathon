import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewedHandoff } from '../sites/spec-desk/relay/reviewed-handoff.js';
import { TraceBus } from '../vendor/nsdeploy-runtime/trace.js';
import { draftCriteria } from '../sites/spec-desk/tools/criteria-drafter.js';
import { relayMarkdown } from '../shared/export.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function harness({ consent = async () => 'allow', draftWait, handoffWait, failure } = {}) {
  const input = { values: { feature_request: 'Save must persist edits.', feature_title: 'Save', platform: 'Web', customer_name: 'Acme Docs', internal_notes: 'Private pilot notes' }, unticked: new Set(), reviewedText: '' };
  const calls = [];
  const contacts = [];
  const traces = [];
  const requests = [];
  const binding = { target: 'https://planner.example/test_planner' };
  const draftTrace = new TraceBus();
  const handoffTrace = new TraceBus();
  const runtime = (trace, runTurn) => ({ trace, engine: {
    top: { network: { setLink: (slot, url) => calls.push({ slot, url }) } },
    runtimeAllowedPeers: new Set(), resetHistory() {}, runTurn,
  } });
  const draft = runtime(draftTrace, async (text, options) => {
    calls.push({ text, ...options });
    if (draftWait) await draftWait.promise;
    const span = draftTrace.start('tool_call', { origin: 'desk.example' });
    draftTrace.end(span, { result: draftCriteria(options.slyData) });
  });
  const handoff = runtime(handoffTrace, async (text, options) => {
    calls.push({ text, ...options });
    const decision = await options.peerConsent({ peerOrigin: 'planner.example', requestText: text });
    if (decision !== 'allow') {
      handoffTrace.note('consent', { decision: 'declined' });
      return;
    }
    contacts.push('planner.example');
    if (handoffWait) await handoffWait.promise;
    if (failure) throw new Error(failure);
    const span = handoffTrace.start('tool_call', { origin: 'planner.example' });
    handoffTrace.end(span, { result: { plan: { cases: [{ id: 'TC-1', title: options.slyData.acceptance_criteria[0].title }], platform_notes: [] } } });
  });
  const controller = createReviewedHandoff({ draft, handoff, read: () => input, bind: () => binding,
    allowed: ['acceptance_criteria', 'feature_title', 'platform'], localOrigin: 'desk.example',
    consent: async (request) => { requests.push(request); return consent(request); },
    onTrace: (event) => traces.push(event.detail),
  });
  const ready = async () => {
    const result = await controller.run();
    input.reviewedText = JSON.stringify(result.criteria.criteria);
    return result;
  };
  return { controller, input, calls, contacts, traces, requests, binding, draftTrace, handoffTrace, ready };
}

test('requires a current draft and validates the exact approved review before any peer run', async () => {
  const h = harness();
  assert.equal(await h.controller.run(true), null);
  await h.ready();
  const row = JSON.parse(h.input.reviewedText)[0];
  for (const bad of [null, {}, [], [null], [row, row], [{ ...row, id: {} }], [{ ...row, title: {} }], [{ ...row, then: '' }], [{ ...row, tags: 'sync' }], [{ ...row, priority: 'P0' }], [{ ...row, requirement_ids: ['REQ-404'] }], [{ ...row, private_extra: 'secret' }]]) {
    h.input.reviewedText = JSON.stringify(bad);
    await assert.rejects(h.controller.run(true));
    assert.equal(h.controller.state.running, false);
  }
  h.input.reviewedText = '{broken';
  await assert.rejects(h.controller.run(true), /valid JSON/);
  assert.equal(h.contacts.length, 0);
  assert.equal(h.calls.length, 1);
});

test('waits for consent with the exact reviewed payload and frozen sharing choices', async () => {
  const decision = deferred();
  const h = harness({ consent: () => decision.promise });
  await h.ready();
  const rows = JSON.parse(h.input.reviewedText);
  rows[0].title = 'Reviewed save behavior';
  h.input.reviewedText = JSON.stringify(rows);
  h.input.unticked.add('platform');
  const running = h.controller.run(true);
  assert.equal(h.controller.state.running, true);
  assert.equal(await h.controller.run(), null);
  assert.equal(h.contacts.length, 0);
  assert.deepEqual(h.requests[0].payload, { acceptance_criteria: rows, feature_title: 'Save' });
  assert.deepEqual(h.requests[0].withheld, { platform: 'Web', customer_name: 'Acme Docs', internal_notes: 'Private pilot notes' });
  h.input.values.feature_title = 'Changed during consent';
  h.input.unticked.delete('platform');
  decision.resolve('allow');
  const result = await running;
  assert.deepEqual(result.approvedCriteria, rows);
  assert.equal(result.plan.plan.cases[0].title, 'Reviewed save behavior');
  assert.equal(h.requests[0].payload.feature_title, 'Save');
  assert.equal(result.stale, true);
  assert.equal(h.controller.state.running, false);
  assert.equal(h.contacts.length, 1);
});

test('decline and leak guard both prevent peer contact even if an adapter returns allow', async () => {
  for (const leaks of [false, true]) {
    const h = harness({ consent: async () => leaks ? 'allow' : 'decline' });
    await h.ready();
    if (leaks) {
      const rows = JSON.parse(h.input.reviewedText);
      rows[0].title = 'Acme Docs must approve';
      h.input.reviewedText = JSON.stringify(rows);
    }
    const result = await h.controller.run(true);
    assert.equal(result.plan, null);
    assert.equal(result.receipt.declined, true);
    assert.equal(result.consentLog[0].decision, 'declined');
    assert.equal(h.contacts.length, 0);
  }
});

test('intake edits invalidate approval and a late draft cannot restore review readiness', async () => {
  const wait = deferred();
  const h = harness({ draftWait: wait });
  const running = h.controller.run();
  h.input.values.feature_request = 'Changed feature';
  h.controller.invalidate();
  wait.resolve();
  const result = await running;
  assert.equal(result.stale, true);
  assert.equal(h.controller.state.reviewReady, false);
  assert.equal(await h.controller.run(true), null);
});

test('review edits during execution mark the plan and export stale without changing approved text', async () => {
  const wait = deferred();
  const h = harness({ handoffWait: wait });
  await h.ready();
  const approved = JSON.parse(h.input.reviewedText);
  const running = h.controller.run(true);
  await Promise.resolve();
  h.input.reviewedText = '[]';
  h.controller.invalidate();
  wait.resolve();
  const result = await running;
  assert.equal(result.stale, true);
  assert.deepEqual(result.approvedCriteria, approved);
  assert.match(relayMarkdown(h.controller.exportData()), /Stale/);
});

test('applies the current visitor binding and cleans trace listeners after runtime failure', async () => {
  const h = harness({ failure: 'Planner unavailable' });
  await h.ready();
  h.binding.target = 'https://radar.example/risk_test_planner';
  const result = await h.controller.run(true);
  assert.ok(h.calls.some((call) => call.slot === 'test_planner' && call.url === h.binding.target));
  assert.equal(result.failure, 'Planner unavailable');
  assert.equal(h.controller.state.running, false);
  const count = h.traces.length;
  h.draftTrace.note('later'); h.handoffTrace.note('later');
  assert.equal(h.traces.length, count);
  assert.match(relayMarkdown(h.controller.exportData()), /Planner unavailable/);
});

test('post-run edits mark exports stale and intake edits require a new draft', async () => {
  const h = harness();
  await h.ready();
  await h.controller.run(true);
  h.input.unticked.add('platform');
  h.controller.invalidate();
  assert.equal(h.controller.exportData().stale, true);
  assert.equal(h.controller.state.reviewReady, true);
  h.input.values.feature_request = 'New feature';
  h.controller.invalidate();
  assert.equal(h.controller.state.reviewReady, false);
  assert.equal(await h.controller.run(true), null);
});
