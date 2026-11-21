/** A local review artifact, including failures and receipt; never claims a completed plan. */
export function relayMarkdown({ criteria, plan, receipt, approvedCriteria, stale = false, failure } = {}) {
  const out = ['# Spec Relay review', '', stale ? '**Stale: inputs changed; review and plan again.**' : 'Review the suggested checks before implementation.'];
  if (criteria?.requirements) for (const r of criteria.requirements) out.push(`- ${r.id}: ${r.text} (feature_request [${r.source.start}, ${r.source.end}))`);
  for (const c of approvedCriteria || criteria?.criteria || []) out.push('', `## ${c.id}: ${c.title}`, `Status: ${c.status || 'reviewed suggestion'}`, `Source requirements: ${(c.requirement_ids || []).join(', ') || 'none'}`, `Given ${c.given || ''}; when ${c.when || ''}; then ${c.then || ''}.`);
  if (plan?.plan?.cases) for (const c of plan.plan.cases) out.push('', `### ${c.id}: ${c.title}`, `Covers ${c.criterion}`, ...(c.steps || []).map((s, i) => `${i + 1}. ${s}`), `Expected: ${c.expected}`);
  if (plan?.risks) out.push('', '## Risks', ...plan.risks.map((r) => `- ${r.id}: ${r.area} (${r.priority})`), ...plan.charters.map((c) => `- ${c.id}: ${c.mission}`));
  if (!plan) out.push('', 'Plan not produced.');
  if (failure) out.push('', `Failure: ${failure}`);
  out.push('', '## Boundary receipt', '```json', JSON.stringify(receipt || {}, null, 2), '```');
  return out.join('\n');
}
export function downloadReview(text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'spec-relay-review.md'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
