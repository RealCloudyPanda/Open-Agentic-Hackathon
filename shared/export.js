/** A local review artifact, including failures and receipt; never claims a completed plan. */
export function relayMarkdown({ criteria, plan, receipt, approvedCriteria, stale = false, failure, consentLog = [] } = {}) {
  const out = ['# Spec Relay review', '', stale ? '**Stale: inputs changed; review and plan again.**' : 'Review the suggested checks before implementation.', '', 'Generated checks and plans have not been executed.'];
  if (criteria?.requirements) for (const r of criteria.requirements) out.push(`- ${r.id}: ${r.text} (feature_request [${r.source.start}, ${r.source.end}))`);
  for (const c of approvedCriteria || criteria?.criteria || []) out.push('', `## ${c.id}: ${c.title}`, `Status: ${approvedCriteria ? 'tester_approved' : c.status || 'suggested_check'}`, `Priority: ${c.priority || 'unspecified'}`, `Source requirements: ${(c.requirement_ids || []).join(', ') || 'none'}`, `Given ${c.given || ''}; when ${c.when || ''}; then ${c.then || ''}.`);
  if (criteria?.open_questions?.length) out.push('', '## Open questions', ...criteria.open_questions.map((q) => `- ${q}`));
  if (plan) out.push('', `Planner origin: ${plan.origin || 'unreported'}`, `Criteria source: ${plan.criteria_source || 'unreported'}`, `Received fields: ${(plan.received_fields || []).join(', ') || 'unreported'}`);
  if (plan?.plan?.cases) {
    for (const c of plan.plan.cases) out.push('', `### ${c.id}: ${c.title}`, `Covers ${c.criterion}; ${c.type || 'unspecified type'}; ${c.level || 'unspecified level'}; ${c.priority || 'unspecified priority'}`, ...(c.steps || []).map((s, i) => `${i + 1}. ${s}`), `Expected: ${c.expected}`);
    if (plan.plan.platform_notes?.length) out.push('', '## Platform checks', ...plan.plan.platform_notes.map((n) => `- ${n}`));
    if (plan.plan.coverage) out.push('', '## Coverage', ...Object.entries(plan.plan.coverage).map(([id, cases]) => `- ${id}: ${cases.join(', ')}`));
  }
  if (plan?.risks) {
    out.push('', '## Risks', ...plan.risks.map((r) => `- ${r.id}: ${r.area} (${r.priority}); impact ${r.impact} × likelihood ${r.likelihood} = ${r.score}; criteria ${(r.criteria || []).join(', ')}`));
    for (const c of plan.charters || []) out.push('', `### ${c.id}: ${c.mission}`, `Timebox: ${c.timebox_min} min; priority ${c.priority}; risks ${(c.risks || []).join(', ')}; criteria ${(c.criteria || []).join(', ')}`);
    if (!plan.charters?.length) out.push('', 'Exploratory charters not produced.');
  }
  if (!plan) out.push('', 'Plan not produced.');
  if (failure) out.push('', `Failure: ${failure}`);
  if (consentLog.length) out.push('', '## Contact decisions', ...consentLog.map((c) => `- ${c.decision} ${c.origin} at ${c.time}`));
  out.push('', '## Boundary receipt', '```json', JSON.stringify(receipt || {}, null, 2), '```');
  return out.join('\n');
}
export function downloadReview(text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'spec-relay-review.md'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
