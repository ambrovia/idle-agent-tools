// An api harness's own tool, as a harness that has specialised on this project might have built it: the layout in its
// description, and a new resource written out the way every other one is.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const description = `Add a resource to the api project, laid out like every other one. The layout, for any change: a resource <name> lives in src/resources/<name>/ — schema.js (export const schema = { field: { type, required, values } }; types string, integer, boolean, date, enum), store.js (createStore('<3-letter prefix>')), handlers.js (list/get/create/update/delete with validate and ok/fail from src/lib), routes.js (the five routes). It is listed in src/routes.js, tested in test/<name>.test.js, documented in docs/<name>.md and linked from docs/README.md. A new field goes into schema.js, the docs table and a test. A list filter reads request.query in the list handler. This tool writes all of that for a new resource, then run the tests.`;
export const parameters = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'plural, e.g. coupons' },
    one: { type: 'string', description: 'singular, e.g. coupon' },
    prefix: { type: 'string', description: 'three letters for ids, e.g. cpn' },
    fields: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string', description: 'string, integer, boolean, date or enum' }, required: { type: 'boolean' }, values: { type: 'array', items: { type: 'string' } } }, required: ['name', 'type'] } },
  },
  required: ['name', 'one', 'prefix', 'fields'],
};

type Field = { name: string; type: string; required?: boolean; values?: string[] };

export async function run({ name, one, prefix, fields }: { name: string; one: string; prefix: string; fields: Field[] }, base: { cwd: string }) {
  const put = (path: string, text: string) => { mkdirSync(dirname(join(base.cwd, path)), { recursive: true }); writeFileSync(join(base.cwd, path), text); };
  const Name = one[0].toUpperCase() + one.slice(1);
  const rule = (f: Field) => (f.type === 'enum' ? `{ type: 'enum', values: [${(f.values ?? []).map((v) => `'${v}'`).join(', ')}], required: ${Boolean(f.required)} }` : `{ type: '${f.type}', required: ${Boolean(f.required)} }`);
  const sample = (f: Field) => (f.type === 'integer' ? '1200' : f.type === 'boolean' ? 'true' : f.type === 'date' ? "'2026-07-01'" : f.type === 'enum' ? `'${f.values?.[0]}'` : `'some ${f.name}'`);
  put(`src/resources/${name}/schema.js`, `// What a ${one} is made of.\nexport const schema = {\n${fields.map((f) => `  ${f.name}: ${rule(f)},`).join('\n')}\n};\n`);
  put(`src/resources/${name}/store.js`, `import { createStore } from '../../lib/store.js';\n\nexport const ${name} = createStore('${prefix}');\n`);
  const handlers = readFileSync(join(base.cwd, 'src/resources/users/handlers.js'), 'utf8').replaceAll('users', name).replaceAll('Users', `${Name}s`).replaceAll('User', Name).replaceAll("'user", `'${one}`);
  put(`src/resources/${name}/handlers.js`, handlers);
  put(`src/resources/${name}/routes.js`, readFileSync(join(base.cwd, 'src/resources/users/routes.js'), 'utf8').replaceAll('/users', `/${name}`).replaceAll('User', Name));
  const valid = `{ ${fields.filter((f) => f.required).map((f) => `${f.name}: ${sample(f)}`).join(', ')} }`;
  put(`test/${name}.test.js`, `import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { handle } from '../src/app.js';
import { ${name} } from '../src/resources/${name}/store.js';

beforeEach(() => ${name}.clear());

test('a ${one} can be created, read and deleted', () => {
  const created = handle({ method: 'POST', path: '/${name}', body: ${valid} });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.id, '${prefix}_1');
  assert.equal(handle({ method: 'GET', path: '/${name}/${prefix}_1' }).status, 200);
  assert.equal(handle({ method: 'DELETE', path: '/${name}/${prefix}_1' }).status, 200);
});

test('a ${one} without its required fields is refused', () => {
  assert.equal(handle({ method: 'POST', path: '/${name}', body: {} }).status, ${fields.some((f) => f.required) ? 400 : 201});
});
`);
  const type = (f: Field) => (f.type === 'enum' ? `one of ${(f.values ?? []).map((v) => `\`${v}\``).join(', ')}` : f.type);
  put(`docs/${name}.md`, `# ${Name}s\n\nId prefix \`${prefix}\`.\n\n| Field | Type | Required |\n|---|---|---|\n${fields.map((f) => `| \`${f.name}\` | ${type(f)} | ${f.required ? 'yes' : 'no'} |`).join('\n')}\n\n- \`GET /${name}\` — every ${one}\n- \`GET /${name}/:id\` — one ${one}\n- \`POST /${name}\` — create a ${one}\n- \`PATCH /${name}/:id\` — change some fields\n- \`DELETE /${name}/:id\` — delete it\n`);
  const routes = readFileSync(join(base.cwd, 'src/routes.js'), 'utf8');
  put('src/routes.js', routes.replace(/\n\n\/\/ Every/, `\nimport { routes as ${name} } from './resources/${name}/routes.js';\n\n// Every`).replace(/\];\s*$/, `, ...${name}];\n`));
  const index = readFileSync(join(base.cwd, 'docs/README.md'), 'utf8');
  put('docs/README.md', `${index.trimEnd()}\n- [${Name}s](${name}.md)\n`);
  return `wrote src/resources/${name}/, test/${name}.test.js and docs/${name}.md, and listed it in src/routes.js and docs/README.md`;
}
