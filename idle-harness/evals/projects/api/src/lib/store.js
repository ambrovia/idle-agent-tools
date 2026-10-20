// An in-memory table. Ids are the resource's three-letter prefix and a counter: usr_1, usr_2, …
export function createStore(prefix) {
  const rows = new Map();
  let next = 1;
  return {
    list: () => [...rows.values()],
    get: (id) => rows.get(id),
    add(fields) {
      const row = { id: `${prefix}_${next++}`, ...fields, createdAt: new Date().toISOString() };
      rows.set(row.id, row);
      return row;
    },
    update(id, fields) {
      const row = rows.get(id);
      if (!row) return undefined;
      Object.assign(row, fields);
      return row;
    },
    remove: (id) => rows.delete(id),
    clear() { rows.clear(); next = 1; },
  };
}
