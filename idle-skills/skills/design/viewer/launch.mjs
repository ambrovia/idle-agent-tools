#!/usr/bin/env node
/**
 * launch.mjs — one-command launcher for the component viewer.
 *
 * Turns the manual "copy → npm install → npm run dev → find the URL" dance into
 * a single idempotent command the design skill (or a human) runs.
 * Zero runtime dependencies — Node built-ins only — so it works straight from a
 * plugin install with nothing pre-installed.
 *
 * The viewer must live INSIDE the target project: it renders that project's
 * `src/**​/*.stories.tsx` live (Vite compiles them on demand), so a prebuilt
 * bundle can't stand in. This copies the viewer into the project once, installs
 * its toolchain once (esbuild ships a platform-native binary, so this can't be
 * vendored), then runs the dev server.
 *
 * Usage:
 *   node launch.mjs [project-dir]     # default: current working directory
 *   node launch.mjs --port 5200 .
 *   node launch.mjs --help
 *
 * Resolving the launcher path from an installed plugin:
 *   Claude Code : node "${CLAUDE_PLUGIN_ROOT}/skills/design/viewer/launch.mjs" <project>
 *   Codex CLI   : node "${PLUGIN_ROOT}/skills/design/viewer/launch.mjs" <project>
 *   opencode    : resolve via the plugin module's import.meta.url (no plugin-root env var)
 *
 * Exit codes: 0 = viewer reachable (freshly started or already running); 1 = failed.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { get } from "node:http";

const SELF_DIR = dirname(fileURLToPath(import.meta.url)); // the plugin's viewer/ dir
const READY_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 500;
const DEFAULT_STORY_GLOBS = [
  "../src/**/*.stories.tsx",
  "../packages/*/src/**/*.stories.tsx",
  "../apps/*/src/**/*.stories.tsx",
];
const COMMON_CSS_NAMES = new Set([
  "index.css",
  "global.css",
  "globals.css",
  "app.css",
  "styles.css",
  "style.css",
  "tokens.css",
  "index.scss",
  "global.scss",
  "globals.scss",
  "app.scss",
  "styles.scss",
  "style.scss",
  "tokens.scss",
]);
const MAIN_ENTRY_NAMES = new Set([
  "main.tsx",
  "main.ts",
  "main.jsx",
  "main.js",
  "index.tsx",
  "index.ts",
  "index.jsx",
  "index.js",
]);
const POSTCSS_CONFIG_NAMES = [
  "postcss.config.js",
  "postcss.config.cjs",
  "postcss.config.mjs",
  "postcss.config.ts",
  ".postcssrc",
  ".postcssrc.json",
  ".postcssrc.js",
  ".postcssrc.cjs",
  ".postcssrc.mjs",
];
const TAILWIND_CONFIG_NAMES = [
  "tailwind.config.js",
  "tailwind.config.cjs",
  "tailwind.config.mjs",
  "tailwind.config.ts",
];

function parseArgs(argv) {
  const opts = { project: process.cwd(), port: 5173 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--port") opts.port = Number(argv[++i]);
    else if (a.startsWith("--port=")) opts.port = Number(a.slice(7));
    else if (!a.startsWith("-")) opts.project = resolve(a);
  }
  return opts;
}

function log(msg) {
  process.stderr.write(`[viewer] ${msg}\n`);
}

function loud(msg) {
  log(`WARNING: ${msg}`);
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function fileExists(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function dirExists(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function resolveProjectPath(project, value) {
  return isAbsolute(value) ? value : resolve(project, value);
}

function slash(path) {
  return path.split(sep).join("/");
}

function viewerImportPath(viewerDir, targetPath) {
  return `/@fs/${slash(resolve(targetPath))}`;
}

function storyGlobFromProject(project, viewerDir, glob) {
  const absolutePattern = isAbsolute(glob)
    ? glob
    : resolve(project, glob.replace(/^\.\//, ""));
  let rel = slash(relative(viewerDir, absolutePattern));
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel;
}

function parseJsonConfig(project) {
  const path = join(project, ".pipeline", "viewer.config.json");
  if (!fileExists(path)) return {};
  try {
    const parsed = JSON.parse(readText(path));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    loud(`${path} could not be parsed: ${error.message}`);
    return {};
  }
}

function parseScalar(raw) {
  const trimmed = stripInlineComment(raw).trim();
  if (!trimmed) return "";
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((part) => parseScalar(part))
      .filter(Boolean);
  }
  return trimmed;
}

function stripInlineComment(raw) {
  let quote = null;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if ((char === '"' || char === "'") && raw[i - 1] !== "\\") {
      quote = quote === char ? null : quote ?? char;
    }
    if (char === "#" && !quote && (i === 0 || /\s/.test(raw[i - 1]))) {
      return raw.slice(0, i);
    }
  }
  return raw;
}

function parseSimpleYaml(project) {
  const path = join(project, "pipeline.config.yml");
  if (!fileExists(path)) return {};
  const out = {};
  const lines = readText(path).split(/\r?\n/);
  let section = null;
  let listKey = null;
  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const top = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (top) {
      section = top[1];
      listKey = null;
      if (!out[section]) out[section] = {};
      if (top[2]) out[section]._value = parseScalar(top[2]);
      continue;
    }
    if (!section) continue;
    const key = line.match(/^\s{2}([A-Za-z][\w-]*):\s*(.*)$/);
    if (key) {
      listKey = key[1];
      const value = key[2];
      if (!value) out[section][listKey] = [];
      else out[section][listKey] = parseScalar(value);
      continue;
    }
    const item = line.match(/^\s{4}-\s*(.*)$/);
    if (item && listKey) {
      if (!Array.isArray(out[section][listKey])) out[section][listKey] = [];
      out[section][listKey].push(parseScalar(item[1]));
    }
  }
  return out;
}

function walkFiles(root, shouldEnter, out = []) {
  if (!dirExists(root)) return out;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "viewer") {
      continue;
    }
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (!shouldEnter || shouldEnter(full)) walkFiles(full, shouldEnter, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function sourceRoots(project, designSystemPath) {
  const roots = [];
  for (const relRoot of ["src", "packages", "apps"]) {
    const abs = join(project, relRoot);
    if (dirExists(abs)) roots.push(abs);
  }
  if (designSystemPath) {
    const abs = resolveProjectPath(project, designSystemPath);
    if (dirExists(abs)) roots.push(abs);
  }
  return uniq(roots);
}

function detectStoryGlobs(project, explicitGlobs) {
  if (explicitGlobs.length > 0) return explicitGlobs;
  const candidates = [
    "src/**/*.stories.tsx",
    "packages/*/src/**/*.stories.tsx",
    "apps/*/src/**/*.stories.tsx",
  ];
  return candidates.filter((glob) => {
    const base = glob.split("/**/")[0].replace("/*/", "/");
    if (glob.startsWith("packages/*/")) return dirExists(join(project, "packages"));
    if (glob.startsWith("apps/*/")) return dirExists(join(project, "apps"));
    return dirExists(join(project, base));
  });
}

function cssImportsFromMainEntries(project, roots) {
  const found = [];
  const importRe = /import\s+(?:[^'"]+\s+from\s+)?["']([^"']+\.s?css(?:\?[^"']*)?)["'];?/g;
  for (const root of roots) {
    const files = walkFiles(root, (dir) => !dir.includes(`${sep}node_modules${sep}`));
    for (const file of files) {
      if (!MAIN_ENTRY_NAMES.has(file.split(sep).pop())) continue;
      const text = readText(file);
      let match;
      while ((match = importRe.exec(text))) {
        const spec = match[1].split("?")[0];
        if (spec.startsWith(".")) {
          const resolved = resolve(dirname(file), spec);
          if (fileExists(resolved)) found.push(resolved);
        } else if (spec.startsWith("/")) {
          const resolved = resolve(project, spec.slice(1));
          if (fileExists(resolved)) found.push(resolved);
        } else {
          try {
            const resolved = createRequire(file).resolve(spec);
            if (fileExists(resolved)) found.push(realpathSync(resolved));
          } catch {
            // A package export can point at a generated CSS artifact that does not
            // exist until its package build runs. Explicit viewer config handles
            // that case below; unresolved incidental imports are ignored here.
          }
        }
      }
    }
  }
  return found;
}

function commonCssEntries(roots) {
  const found = [];
  for (const root of roots) {
    const files = walkFiles(root, (dir) => !dir.includes(`${sep}node_modules${sep}`));
    for (const file of files) {
      if (COMMON_CSS_NAMES.has(file.split(sep).pop())) found.push(file);
    }
  }
  return found;
}

function nearestPackageWithCssBuild(project, target) {
  const projectRoot = resolve(project);
  let current = dirname(resolve(target));
  while (current.startsWith(projectRoot)) {
    const packageJson = join(current, "package.json");
    if (fileExists(packageJson)) {
      try {
        const pkg = JSON.parse(readText(packageJson));
        if (pkg?.scripts?.["build:css"]) return { directory: current, packageJson: pkg };
      } catch {
        return null;
      }
    }
    if (current === projectRoot) break;
    current = dirname(current);
  }
  return null;
}

function nearestPackageRoot(project, target) {
  const projectRoot = resolve(project);
  let current = fileExists(target) ? dirname(resolve(target)) : resolve(target);
  while (current.startsWith(projectRoot)) {
    if (fileExists(join(current, "package.json"))) return current;
    if (current === projectRoot) break;
    current = dirname(current);
  }
  return projectRoot;
}

function packageRunner(project) {
  const packageManager = readText(join(project, "package.json"));
  try {
    const value = JSON.parse(packageManager).packageManager ?? "";
    if (value.startsWith("bun@")) return { command: "bun", args: ["run", "build:css"] };
    if (value.startsWith("pnpm@")) return { command: "pnpm", args: ["run", "build:css"] };
    if (value.startsWith("yarn@")) return { command: "yarn", args: ["build:css"] };
  } catch {
    // Fall through to npm for projects without readable package-manager metadata.
  }
  return { command: "npm", args: ["run", "build:css"] };
}

function materializeConfiguredCss(project, entries) {
  const attemptedPackages = new Set();
  for (const entry of entries) {
    const owner = nearestPackageWithCssBuild(project, entry);
    const looksGenerated = /\.(?:compiled|generated|built)\.[^.]+$/.test(entry);
    if (fileExists(entry) && !looksGenerated) continue;
    if (!owner || attemptedPackages.has(owner.directory)) continue;
    attemptedPackages.add(owner.directory);
    const runner = packageRunner(project);
    log(`building configured generated CSS in ${slash(relative(project, owner.directory)) || "."}`);
    const result = spawnSync(runner.command, runner.args, {
      cwd: owner.directory,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.status !== 0) {
      loud(`build:css failed in ${owner.directory}; continuing with CSS discovery fallback`);
    }
  }
  return entries.filter(fileExists);
}

export function detectCssEntries(project, viewerConfig, designSystem) {
  const explicit = [
    ...toArray(viewerConfig.css),
    ...toArray(viewerConfig.cssEntry),
    ...toArray(viewerConfig.cssEntries),
  ].map((entry) => resolveProjectPath(project, entry));
  if (explicit.length > 0) {
    const materialized = materializeConfiguredCss(project, explicit);
    if (materialized.length > 0) return { entries: materialized, source: "explicit config" };
    loud(`configured CSS entries do not exist after build: ${explicit.map((entry) => slash(relative(project, entry))).join(", ")}; falling back to discovery`);
  }

  const roots = sourceRoots(project, designSystem.path);
  const mainImports = cssImportsFromMainEntries(project, roots);
  if (mainImports.length > 0) return { entries: uniq(mainImports), source: "app entry imports" };

  const common = commonCssEntries(roots);
  if (common.length > 0) {
    const designTokens = designSystem.tokens
      ? resolveProjectPath(project, designSystem.tokens)
      : null;
    const ordered = designTokens && fileExists(designTokens)
      ? [designTokens, ...common.filter((entry) => resolve(entry) !== resolve(designTokens))]
      : common;
    return { entries: uniq(ordered), source: "common CSS names" };
  }

  if (designSystem.tokens) {
    const tokens = resolveProjectPath(project, designSystem.tokens);
    if (fileExists(tokens)) return { entries: [tokens], source: "designSystem.tokens" };
  }

  return { entries: [], source: "none" };
}

function cssReferencesTailwind(entries) {
  return entries.some((entry) => /@import\s+["']tailwindcss["']|@tailwind|@config|@source/.test(readText(entry)));
}

function resolvePackageJson(project, packageName) {
  try {
    const projectRequire = createRequire(join(project, "package.json"));
    return projectRequire.resolve(`${packageName}/package.json`);
  } catch {
    try {
      const projectRequire = createRequire(join(project, "package.json"));
      let current = dirname(projectRequire.resolve(packageName));
      const root = parse(current).root;
      while (current && current !== root) {
        const pkg = join(current, "package.json");
        if (fileExists(pkg)) return pkg;
        current = dirname(current);
      }
    } catch {
      return null;
    }
    return null;
  }
}

function packageVersion(project, packageName) {
  const pkgPath = resolvePackageJson(project, packageName);
  if (!pkgPath) return null;
  try {
    return JSON.parse(readText(pkgPath)).version ?? null;
  } catch {
    return null;
  }
}

function nearestPostcssConfigDir(project, target) {
  const projectRoot = resolve(project);
  let current = fileExists(target) ? dirname(resolve(target)) : resolve(target);
  while (current.startsWith(projectRoot)) {
    if (POSTCSS_CONFIG_NAMES.some((name) => fileExists(join(current, name)))) return current;
    if (current === projectRoot) break;
    current = dirname(current);
  }
  return null;
}

function nearestTailwindConfig(project, target) {
  const projectRoot = resolve(project);
  let current = fileExists(target) ? dirname(resolve(target)) : resolve(target);
  while (current.startsWith(projectRoot)) {
    for (const name of TAILWIND_CONFIG_NAMES) {
      const candidate = join(current, name);
      if (fileExists(candidate)) return candidate;
    }
    if (current === projectRoot) break;
    current = dirname(current);
  }
  return null;
}

export function detectToolchain(project, viewerConfig, cssEntries) {
  const hint = viewerConfig.toolchain ?? viewerConfig.cssToolchain;
  const primaryEntry = cssEntries.find((entry) =>
    /@import\s+["']tailwindcss["']|@tailwind|@config|@source/.test(readText(entry)),
  ) ?? cssEntries[0];
  const packageRoot = primaryEntry ? nearestPackageRoot(project, primaryEntry) : resolve(project);
  const postcssConfigDir = primaryEntry
    ? nearestPostcssConfigDir(project, primaryEntry)
    : nearestPostcssConfigDir(project, project);
  const tailwindConfigPath = primaryEntry ? nearestTailwindConfig(project, primaryEntry) : null;
  if (hint && hint !== "auto") {
    if (hint === "tailwind-v3") return { toolchain: "tailwind-v3", postcssConfigDir, packageRoot, tailwindConfigPath };
    if (hint === "tailwind-v4") return { toolchain: "tailwind-v4", postcssConfigDir: null, packageRoot, tailwindConfigPath };
    return { toolchain: "none", postcssConfigDir: null, packageRoot, tailwindConfigPath };
  }

  const tailwindVersion = packageVersion(packageRoot, "tailwindcss");
  const major = tailwindVersion ? Number(tailwindVersion.split(".")[0]) : 0;
  const hasTailwindVite = Boolean(resolvePackageJson(packageRoot, "@tailwindcss/vite"));
  const referencesTailwind = cssReferencesTailwind(cssEntries);

  if (major >= 4 && hasTailwindVite && referencesTailwind) {
    return { toolchain: "tailwind-v4", postcssConfigDir: null, packageRoot, tailwindConfigPath };
  }
  if (major === 3 && postcssConfigDir && referencesTailwind) {
    return { toolchain: "tailwind-v3", postcssConfigDir, packageRoot, tailwindConfigPath };
  }
  return { toolchain: "none", postcssConfigDir: null, packageRoot, tailwindConfigPath };
}

function packageEntry(pkg) {
  const rootExport = pkg?.exports?.["."];
  if (typeof rootExport === "string") return rootExport;
  if (rootExport && typeof rootExport === "object") {
    for (const key of ["import", "default", "module", "browser"]) {
      if (typeof rootExport[key] === "string") return rootExport[key];
    }
  }
  return typeof pkg?.module === "string" ? pkg.module : pkg?.main;
}

function workspaceAliases(project) {
  const aliases = {};
  for (const container of ["packages", "apps"]) {
    const root = join(project, container);
    if (!dirExists(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = join(root, entry.name);
      const packageJson = join(directory, "package.json");
      if (!fileExists(packageJson)) continue;
      try {
        const pkg = JSON.parse(readText(packageJson));
        const target = packageEntry(pkg);
        const resolved = target ? resolve(directory, target) : null;
        if (typeof pkg.name === "string" && resolved && fileExists(resolved)) {
          aliases[pkg.name] = resolved;
        }
      } catch {
        // An unrelated malformed workspace manifest must not break the viewer.
      }
    }
  }
  return aliases;
}

function tsconfigAliases(project, preferredRoots = []) {
  const candidates = walkFiles(project, (dir) => {
    const rel = slash(relative(project, dir));
    return !rel.startsWith("data/") && !rel.startsWith("docs/") && !rel.startsWith(".pipeline/work/");
  }).filter((file) => file.endsWith(`${sep}tsconfig.json`) || file === join(project, "tsconfig.json"));
  const values = new Map();
  for (const configPath of candidates) {
    try {
      const config = JSON.parse(readText(configPath));
      const paths = config?.compilerOptions?.paths;
      if (!paths || typeof paths !== "object") continue;
      const base = resolve(dirname(configPath), config.compilerOptions.baseUrl ?? ".");
      for (const [rawAlias, rawTargets] of Object.entries(paths)) {
        const alias = rawAlias.endsWith("/*") ? rawAlias.slice(0, -2) : rawAlias;
        const target = toArray(rawTargets)[0];
        if (!target) continue;
        const cleanTarget = target.endsWith("/*") ? target.slice(0, -2) : target;
        const resolved = resolve(base, cleanTarget);
        if (!dirExists(resolved) && !fileExists(resolved)) continue;
        const candidates = values.get(alias) ?? [];
        candidates.push({ resolved, configDir: dirname(configPath) });
        values.set(alias, candidates);
      }
    } catch {
      // JSON-with-comments or extended configs are left to explicit viewer aliases.
    }
  }
  const aliases = {};
  for (const [alias, candidates] of values) {
    const unique = uniq(candidates.map(({ resolved }) => resolve(resolved)));
    if (unique.length === 1) {
      aliases[alias] = unique[0];
      continue;
    }
    const preferred = uniq(
      candidates
        .filter(({ configDir }) => preferredRoots.some((root) =>
          configDir === resolve(root) || configDir.startsWith(`${resolve(root)}${sep}`),
        ))
        .map(({ resolved }) => resolve(resolved)),
    );
    if (preferred.length === 1) aliases[alias] = preferred[0];
  }
  return aliases;
}

export function detectAliases(project, viewerConfig, preferredRoots = []) {
  const explicit = viewerConfig.aliases;
  const configured = explicit && typeof explicit === "object"
    ? Object.fromEntries(
        Object.entries(explicit)
          .filter(([, target]) => typeof target === "string")
          .map(([alias, target]) => [alias, resolveProjectPath(project, target)]),
      )
    : {};
  return { ...workspaceAliases(project), ...tsconfigAliases(project, preferredRoots), ...configured };
}

function jsString(value) {
  return JSON.stringify(value);
}

function writeGeneratedViewerFiles(project, viewerDir) {
  const jsonConfig = parseJsonConfig(project);
  const yaml = parseSimpleYaml(project);
  const viewerConfig = { ...(yaml.viewer ?? {}), ...(jsonConfig.viewer ?? jsonConfig) };
  const designSystem = { ...(yaml.designSystem ?? {}) };
  const explicitStoryGlobs = [
    ...toArray(viewerConfig.storyGlobs),
    ...toArray(viewerConfig.stories),
  ];
  const storyGlobs = detectStoryGlobs(project, explicitStoryGlobs);
  const css = detectCssEntries(project, viewerConfig, designSystem);
  const toolchain = detectToolchain(project, viewerConfig, css.entries);
  const aliases = detectAliases(project, viewerConfig, [toolchain.packageRoot]);

  const storyLines = (storyGlobs.length > 0 ? storyGlobs : DEFAULT_STORY_GLOBS)
    .map((glob) => storyGlobFromProject(project, viewerDir, glob))
    .map(
      (glob) =>
        `  ...import.meta.glob<Record<string, unknown>>(${jsString(glob)}, { eager: true }),`,
    );
  writeFileSync(
    join(viewerDir, "story-globs.generated.ts"),
    [
      'import type { GlobSource } from "./discovery.js";',
      "",
      "export const storyGlobs = {",
      ...storyLines,
      "} as GlobSource;",
      "",
    ].join("\n"),
  );

  const styleLines = css.entries.map(
    (entry) => `import ${jsString(viewerImportPath(viewerDir, entry))};`,
  );
  writeFileSync(
    join(viewerDir, "target-styles.generated.ts"),
    [
      "// Generated by launch.mjs from target project CSS detection.",
      ...styleLines,
      "",
    ].join("\n"),
  );

  writeFileSync(
    join(viewerDir, "viewer-runtime.generated.json"),
    `${JSON.stringify(
      {
        projectRoot: project,
        toolchain: toolchain.toolchain,
        postcssConfigDir: toolchain.postcssConfigDir,
        packageRoot: toolchain.packageRoot,
        tailwindConfigPath: toolchain.tailwindConfigPath,
        aliases,
      },
      null,
      2,
    )}\n`,
  );

  log(`story globs: ${storyGlobs.join(", ") || DEFAULT_STORY_GLOBS.join(", ")}`);
  if (css.entries.length === 0) {
    loud("no target CSS entry detected; stories will render without app styles");
  } else {
    log(`CSS entries (${css.source}): ${css.entries.map((entry) => slash(relative(project, entry))).join(", ")}`);
  }
  log(`CSS toolchain: ${toolchain.toolchain}`);
  if (Object.keys(aliases).length > 0) {
    log(`module aliases: ${Object.keys(aliases).join(", ")}`);
  }
}

function requestText(port, path) {
  return new Promise((res) => {
    const req = get({ host: "localhost", port, path, timeout: 1500 }, (r) => {
      let body = "";
      r.setEncoding("utf8");
      r.on("data", (chunk) => {
        body += chunk;
      });
      r.on("end", () => res({ reachable: true, status: r.statusCode ?? 0, body }));
    });
    req.on("error", () => res({ reachable: false, status: 0, body: "" }));
    req.on("timeout", () => {
      req.destroy();
      res({ reachable: false, status: 0, body: "" });
    });
  });
}

async function inspectViewer(port) {
  const root = await requestText(port, "/");
  if (!root.reachable) return { reachable: false, projectRoot: null };
  const runtime = await requestText(port, "/viewer-runtime.generated.json");
  if (!runtime.reachable || runtime.status !== 200) {
    return { reachable: true, projectRoot: null };
  }
  try {
    const parsed = JSON.parse(runtime.body);
    return {
      reachable: true,
      projectRoot: typeof parsed.projectRoot === "string" ? realpathSync(parsed.projectRoot) : null,
    };
  } catch {
    return { reachable: true, projectRoot: null };
  }
}

export async function chooseViewerPort(startPort, project, inspect = inspectViewer) {
  const canonicalProject = realpathSync(project);
  for (let port = startPort; port < startPort + 50; port++) {
    const state = await inspect(port);
    if (!state.reachable) return { port, reuse: false };
    if (state.projectRoot === canonicalProject) return { port, reuse: true };
    log(`port ${port} belongs to another service or project; trying ${port + 1}`);
  }
  throw new Error(`no available viewer port in ${startPort}-${startPort + 49}`);
}

async function waitUntilReady(port, deadline, project) {
  const canonicalProject = realpathSync(project);
  while (Date.now() < deadline) {
    const state = await inspectViewer(port);
    if (state.projectRoot === canonicalProject) return true;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(
      "Usage: node launch.mjs [project-dir] [--port N]\n" +
        "Copies the viewer into the project (once), installs deps (once), and starts\n" +
        "the dev server. Idempotent — reuses an already-running viewer.\n",
    );
    return 0;
  }

  const project = realpathSync(opts.project);
  const requestedPort = opts.port;

  // 1. Sync the viewer into the project, unless we're already inside it.
  const destViewer = join(project, "viewer");
  const runningFromProject = resolve(destViewer) === resolve(SELF_DIR);
  if (!runningFromProject) {
    log(`${existsSync(destViewer) ? "syncing" : "copying"} viewer → ${destViewer}`);
    mkdirSync(project, { recursive: true });
    cpSync(SELF_DIR, destViewer, {
      recursive: true,
      filter: (src) =>
        !/(^|[\\/])(node_modules|dist|\.vite|\.annotations)([\\/]|$)/.test(src),
    });
  }
  const viewerDir = runningFromProject ? SELF_DIR : destViewer;

  // 2. Generate target-specific static imports before Vite evaluates the app.
  writeGeneratedViewerFiles(project, viewerDir);

  // 3. Reuse only this project's viewer. A different project on the preferred
  // port gets a different port instead of receiving the wrong generated files.
  const selection = await chooseViewerPort(requestedPort, project);
  const { port } = selection;
  const url = `http://localhost:${port}`;
  if (selection.reuse) {
    log(`already running — refreshed viewer files and reusing ${url}`);
    process.stdout.write(url + "\n");
    return 0;
  }

  // 4. Install the toolchain (once).
  if (!existsSync(join(viewerDir, "node_modules"))) {
    log("installing dependencies (first run only)…");
    const install = spawnSync("npm", ["install"], {
      cwd: viewerDir,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (install.status !== 0) {
      log("npm install failed — fall back to the screenshot channel.");
      return 1;
    }
  }

  // 5. Start the dev server, detached, so it outlives this launcher.
  const viteBin = join(
    viewerDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "vite.cmd" : "vite",
  );
  const logFile = join(viewerDir, "vite.log");
  const out = openSync(logFile, "a");
  log("starting dev server…");
  const child = spawn(viteBin, ["--port", String(port)], {
    cwd: viewerDir,
    detached: true,
    stdio: ["ignore", out, out],
    shell: process.platform === "win32",
  });
  child.unref();

  // 6. Wait until it answers, then hand off the URL.
  const ready = await waitUntilReady(port, Date.now() + READY_TIMEOUT_MS, project);
  if (!ready) {
    log(`did not become ready within ${READY_TIMEOUT_MS / 1000}s — see ${logFile}`);
    return 1;
  }
  log(`ready at ${url}`);
  process.stdout.write(url + "\n");
  return 0;
}

const invokedDirectly = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      log(`unexpected error: ${err?.message ?? err}`);
      process.exit(1);
    },
  );
}
