#!/usr/bin/env node
// Node ESM — no external dependencies (fs, path, url only).

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const CHECK_MODE = process.argv.includes('--check');

// ---------------------------------------------------------------------------
// Frontmatter parser
// ---------------------------------------------------------------------------

function parseFrontmatter(src) {
  // Expects the file to start with ---\n, followed by key: value lines, then ---\n
  const lines = src.split('\n');
  if (lines[0].trim() !== '---') throw new Error('Missing opening ---');

  const meta = {};
  let i = 1;
  while (i < lines.length && lines[i].trim() !== '---') {
    const line = lines[i];
    // description is a quoted string — handle that first
    const quotedMatch = line.match(/^(\w+):\s+"(.*)"$/);
    if (quotedMatch) {
      meta[quotedMatch[1]] = quotedMatch[2];
      i++;
      continue;
    }
    const plainMatch = line.match(/^(\w+):\s*(.+)$/);
    if (plainMatch) {
      const key = plainMatch[1];
      const val = plainMatch[2].trim();
      if (val === 'true') meta[key] = true;
      else if (val === 'false') meta[key] = false;
      else meta[key] = val;
    }
    i++;
  }
  if (i >= lines.length) throw new Error('Missing closing ---');
  // body starts after the closing --- line; preserve the leading blank line
  const body = lines.slice(i + 1).join('\n');
  return { meta, body };
}

// ---------------------------------------------------------------------------
// Tool list construction
// ---------------------------------------------------------------------------

function buildClaudeTools(meta) {
  // Fixed order: Read, Grep, Glob, then Bash if bash, Write if write, Edit if edit
  const tools = ['Read', 'Grep', 'Glob'];
  if (meta.bash) tools.push('Bash');
  if (meta.write) tools.push('Write');
  if (meta.edit) tools.push('Edit');
  // Every persona reads and writes the record of work. A `tools` list is an allowlist, so without
  // this a persona only reaches the record through the `idle` command in Bash.
  tools.push('mcp__plugin_idle-tasks_idle');
  return tools.join(', ');
}

function modelFromCapability(capability) {
  return capability === 'high' ? 'opus' : 'sonnet';
}

function codexModelFromCapability(capability) {
  return capability === 'high' ? 'gpt-5.6-sol' : 'gpt-5.6-terra';
}

function opencodeModelFromCapability(capability) {
  return capability === 'high' ? 'openrouter/qwen/qwen3.8-max' : 'openrouter/qwen/qwen3.7-plus';
}

function yamlQuote(s) {
  // double-quoted YAML scalar: escape backslashes then double-quotes
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ---------------------------------------------------------------------------
// DO-NOT-EDIT marker
// ---------------------------------------------------------------------------

function mdMarker(name) {
  return `<!-- GENERATED from personas/${name}.md — edit that file and run scripts/generate-agents.mjs; do not edit here. -->`;
}

function tomlMarker(name) {
  return `# GENERATED from personas/${name}.md — edit that file and run scripts/generate-agents.mjs; do not edit here.`;
}

// ---------------------------------------------------------------------------
// Output generators
// ---------------------------------------------------------------------------

function generateClaude(meta, body) {
  const tools = buildClaudeTools(meta);
  const model = modelFromCapability(meta.capability);
  const fm = [
    '---',
    `name: ${meta.name}`,
    `description: "${yamlQuote(meta.description)}"`,
    `model: ${model}`,
    `tools: ${tools}`,
    '---',
  ].join('\n');
  return `${fm}\n\n${mdMarker(meta.name)}\n${body}`;
}

function generateOpencode(meta, body) {
  const fmLines = [
    '---',
    `description: "${yamlQuote(meta.description)}"`,
    `model: ${opencodeModelFromCapability(meta.capability)}`,
    'mode: subagent',
  ];

  // tools deny-map: only include if write or edit is false
  const denyWrite = meta.write === false;
  const denyEdit = meta.edit === false;
  if (denyWrite || denyEdit) {
    fmLines.push('tools:');
    if (denyWrite) fmLines.push('  write: false');
    if (denyEdit) {
      fmLines.push('  edit: false');
      fmLines.push('  patch: false');
    }
  }
  // If BOTH write and edit are true, omit the tools key entirely.

  fmLines.push('---');
  const fm = fmLines.join('\n');
  return `${fm}\n\n${mdMarker(meta.name)}\n${body}`;
}

function generateCursor(meta, body) {
  const fmLines = [
    '---',
    `name: ${meta.name}`,
    `description: "${yamlQuote(meta.description)}"`,
    'model: inherit',
  ];
  if (meta.write === false && meta.edit === false) {
    fmLines.push('readonly: true');
  }
  fmLines.push('---');
  return `${fmLines.join('\n')}\n\n${mdMarker(meta.name)}\n${body}`;
}

// Antigravity drops an agent whose frontmatter carries fields it does not know
// (Claude's `model` and `tools`), so its format is name and description only.
function generateAntigravity(meta, body) {
  const fmLines = ['---', `name: ${meta.name}`, `description: "${yamlQuote(meta.description)}"`, '---'];
  return `${fmLines.join('\n')}\n\n${mdMarker(meta.name)}\n${body}`;
}

function generateCodex(meta, body) {
  // Escape any literal """ in the body so the TOML multi-line basic string stays valid.
  // NOTE: when this fires, the on-disk developer_instructions bytes differ from the persona
  // body, but a TOML parser re-derives the original — semantic, not byte, identity.
  const escapedBody = body.replace(/"""/g, '\\"\\"\\"');

  const lines = [tomlMarker(meta.name)];
  lines.push(`name = "${meta.name}"`);
  lines.push(`description = "${meta.description.replace(/"/g, '\\"')}"`);
  lines.push(`model = "${codexModelFromCapability(meta.capability)}"`);
  if (meta.capability === 'high') {
    lines.push('model_reasoning_effort = "high"');
  }
  lines.push('');
  lines.push(`developer_instructions = """${escapedBody}"""`);
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const personasDir = join(ROOT, 'personas');
const personaFiles = readdirSync(personasDir).filter(f => f.endsWith('.md'));

const outputs = []; // { path, content }

for (const file of personaFiles) {
  const src = readFileSync(join(personasDir, file), 'utf8');
  const { meta, body } = parseFrontmatter(src);
  const name = meta.name;

  outputs.push({
    path: join(ROOT, 'agents', `${name}.md`),
    content: generateClaude(meta, body),
  });
  outputs.push({
    path: join(ROOT, 'agents-cursor', `${name}.md`),
    content: generateCursor(meta, body),
  });
  outputs.push({
    path: join(ROOT, 'agents-antigravity', `${name}.md`),
    content: generateAntigravity(meta, body),
  });
  outputs.push({
    path: join(ROOT, '.opencode', 'agents', `${name}.md`),
    content: generateOpencode(meta, body),
  });
  outputs.push({
    path: join(ROOT, '.codex', 'agents', `${name}.toml`),
    content: generateCodex(meta, body),
  });
}

if (CHECK_MODE) {
  const outOfDate = [];
  for (const { path, content } of outputs) {
    if (!existsSync(path)) {
      outOfDate.push(`MISSING: ${path}`);
      continue;
    }
    const existing = readFileSync(path, 'utf8');
    if (existing !== content) {
      outOfDate.push(`OUT OF DATE: ${path}`);
    }
  }
  if (outOfDate.length > 0) {
    for (const msg of outOfDate) console.error(msg);
    process.exit(1);
  } else {
    console.log('agents up to date');
    process.exit(0);
  }
} else {
  for (const { path, content } of outputs) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, 'utf8');
    console.log(`wrote: ${path}`);
  }
}
