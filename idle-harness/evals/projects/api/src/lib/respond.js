// Every answer is { status, body }, with the result under data or the problem under error.
export const ok = (data, status = 200) => ({ status, body: { data } });
export const fail = (status, error, details) => ({ status, body: { error, ...(details ? { details } : {}) } });
