// Checks a body against a schema: { field: { type, required, values } }. Types: string, integer, boolean, date
// (YYYY-MM-DD) and enum (one of values). partial skips the required check, for updates. Returns a list of problems.
export function validate(schema, body, { partial = false } = {}) {
  const problems = [];
  for (const [field, rule] of Object.entries(schema)) {
    const value = body?.[field];
    if (value === undefined) {
      if (rule.required && !partial) problems.push(`${field} is required`);
      continue;
    }
    if (rule.type === 'string' && (typeof value !== 'string' || !value.trim())) problems.push(`${field} must be a non-empty string`);
    if (rule.type === 'integer' && !Number.isInteger(value)) problems.push(`${field} must be an integer`);
    if (rule.type === 'boolean' && typeof value !== 'boolean') problems.push(`${field} must be true or false`);
    if (rule.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) problems.push(`${field} must be a date as YYYY-MM-DD`);
    if (rule.type === 'enum' && !rule.values.includes(value)) problems.push(`${field} must be one of ${rule.values.join(', ')}`);
  }
  for (const field of Object.keys(body ?? {})) if (!(field in schema)) problems.push(`${field} is not a field`);
  return problems;
}
