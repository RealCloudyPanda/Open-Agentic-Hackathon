/** Validate the exact human-reviewed snapshot before it can reach a planner. */
export function reviewedCriteria(text, requirements = []) {
  let rows;
  try { rows = JSON.parse(text); } catch { throw new Error('Reviewed criteria must be valid JSON.'); }
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) throw new Error('Provide between 1 and 100 reviewed criteria.');
  const ids = new Set();
  const sourceIds = new Set(requirements.map((r) => r.id));
  const fields = new Set(['id', 'title', 'given', 'when', 'then', 'priority', 'tags', 'requirement_ids', 'status']);
  return rows.map((row, index) => {
    const label = `Criterion ${index + 1}`;
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`${label} must be an object.`);
    if (Object.keys(row).some((key) => !fields.has(key))) throw new Error(`${label} has an unsupported field.`);
    for (const field of ['id', 'title', 'given', 'when', 'then']) {
      if (typeof row[field] !== 'string' || !row[field].trim()) throw new Error(`${label} needs a nonempty ${field}.`);
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(row.id) || ids.has(row.id)) throw new Error(`${label} needs a unique ID using letters, numbers, dots, underscores or hyphens.`);
    ids.add(row.id);
    if (row.priority !== undefined && !['P1', 'P2', 'P3'].includes(row.priority)) throw new Error(`${label} priority must be P1, P2 or P3.`);
    for (const field of ['tags', 'requirement_ids']) {
      if (row[field] !== undefined && (!Array.isArray(row[field]) || row[field].some((v) => typeof v !== 'string' || !v.trim()))) throw new Error(`${label} ${field} must be an array of nonempty strings.`);
    }
    if (row.requirement_ids?.some((id) => !sourceIds.has(id))) throw new Error(`${label} references an unknown source requirement.`);
    if (row.status !== undefined && typeof row.status !== 'string') throw new Error(`${label} status must be text.`);
    return { ...row };
  });
}
