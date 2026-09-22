import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  chooseViewerPort,
  detectAliases,
  detectCssEntries,
  detectToolchain,
} from "../idle-skills/skills/design/viewer/launch.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pipeline-viewer-"));
  writeFileSync(join(root, "package.json"), '{"name":"fixture","private":true}\n');
  return root;
}

test("viewer builds a configured generated CSS entry with the owning package script", () => {
  const root = fixture();
  const pkg = join(root, "packages", "theme");
  mkdirSync(join(pkg, "src"), { recursive: true });
  writeFileSync(
    join(pkg, "package.json"),
    JSON.stringify({ scripts: { "build:css": "node build-css.mjs" } }),
  );
  writeFileSync(
    join(pkg, "build-css.mjs"),
    'import { writeFileSync } from "node:fs"; writeFileSync(new URL("./src/styles.compiled.css", import.meta.url), ".built{}");\n',
  );

  const result = detectCssEntries(
    root,
    { cssEntries: ["packages/theme/src/styles.compiled.css"] },
    {},
  );

  assert.equal(result.source, "explicit config");
  assert.deepEqual(result.entries, [join(pkg, "src", "styles.compiled.css")]);
});

test("viewer refreshes an existing configured generated CSS entry", () => {
  const root = fixture();
  const pkg = join(root, "packages", "theme");
  mkdirSync(join(pkg, "src"), { recursive: true });
  writeFileSync(join(pkg, "src", "styles.compiled.css"), ".stale{}\n");
  writeFileSync(
    join(pkg, "package.json"),
    JSON.stringify({ scripts: { "build:css": "node build-css.mjs" } }),
  );
  writeFileSync(
    join(pkg, "build-css.mjs"),
    'import { writeFileSync } from "node:fs"; writeFileSync(new URL("./src/styles.compiled.css", import.meta.url), ".fresh{}\\n");\n',
  );

  const result = detectCssEntries(
    root,
    { cssEntries: ["packages/theme/src/styles.compiled.css"] },
    {},
  );

  assert.equal(result.source, "explicit config");
  assert.equal(readFileSync(result.entries[0], "utf8"), ".fresh{}\n");
});

test("missing configured CSS falls back to an app entry import", () => {
  const root = fixture();
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "main.tsx"), 'import "./app.css";\n');
  writeFileSync(join(root, "src", "app.css"), ".app{}\n");

  const result = detectCssEntries(root, { cssEntries: ["missing.css"] }, {});

  assert.equal(result.source, "app entry imports");
  assert.deepEqual(result.entries, [join(root, "src", "app.css")]);
});

test("app entry CSS imports resolve through workspace-style package exports", () => {
  const root = fixture();
  const pkg = join(root, "node_modules", "@fixture", "theme");
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(root, "src", "main.tsx"), 'import "@fixture/theme/styles.css";\n');
  writeFileSync(
    join(pkg, "package.json"),
    JSON.stringify({ name: "@fixture/theme", exports: { "./styles.css": "./styles.css" } }),
  );
  writeFileSync(join(pkg, "styles.css"), ".theme{}\n");

  const result = detectCssEntries(root, {}, {});

  assert.equal(result.source, "app entry imports");
  assert.deepEqual(result.entries, [realpathSync(resolve(pkg, "styles.css"))]);
});

test("Tailwind v3 is detected relative to the package that owns the CSS entry", () => {
  const root = fixture();
  const web = join(root, "packages", "web");
  const css = join(web, "src", "index.css");
  mkdirSync(join(web, "src"), { recursive: true });
  mkdirSync(join(web, "node_modules", "tailwindcss"), { recursive: true });
  writeFileSync(css, "@tailwind base;\n@tailwind utilities;\n");
  writeFileSync(join(web, "package.json"), '{"name":"@fixture/web"}\n');
  writeFileSync(join(web, "postcss.config.js"), "export default {};\n");
  writeFileSync(join(web, "tailwind.config.js"), "export default {};\n");
  writeFileSync(
    join(web, "node_modules", "tailwindcss", "package.json"),
    '{"name":"tailwindcss","version":"3.4.0"}\n',
  );

  assert.deepEqual(detectToolchain(root, {}, [css]), {
    toolchain: "tailwind-v3",
    postcssConfigDir: web,
    packageRoot: web,
    tailwindConfigPath: join(web, "tailwind.config.js"),
  });
});

test("an explicit Tailwind v3 hint still uses the CSS package PostCSS config", () => {
  const root = fixture();
  const web = join(root, "packages", "web");
  const css = join(web, "src", "index.css");
  mkdirSync(join(web, "src"), { recursive: true });
  writeFileSync(css, "@tailwind utilities;\n");
  writeFileSync(join(web, "package.json"), '{"name":"@fixture/web"}\n');
  writeFileSync(join(web, "postcss.config.js"), "export default {};\n");
  writeFileSync(join(web, "tailwind.config.js"), "export default {};\n");

  assert.deepEqual(detectToolchain(root, { toolchain: "tailwind-v3" }, [css]), {
    toolchain: "tailwind-v3",
    postcssConfigDir: web,
    packageRoot: web,
    tailwindConfigPath: join(web, "tailwind.config.js"),
  });
});

test("viewer does not reuse a port owned by another project", async () => {
  const root = fixture();
  const inspected = [];
  const result = await chooseViewerPort(5173, root, async (port) => {
    inspected.push(port);
    if (port === 5173) return { reachable: true, projectRoot: "/another/project" };
    return { reachable: false, projectRoot: null };
  });

  assert.deepEqual(inspected, [5173, 5174]);
  assert.deepEqual(result, { port: 5174, reuse: false });
});

test("viewer reuses a port only for the same canonical project", async () => {
  const root = fixture();
  const result = await chooseViewerPort(5200, root, async () => ({
    reachable: true,
    projectRoot: realpathSync(root),
  }));

  assert.deepEqual(result, { port: 5200, reuse: true });
});

test("viewer resolves workspace packages and shared tsconfig aliases", () => {
  const root = fixture();
  const designSystem = join(root, "packages", "design-system");
  const adminUi = join(root, "packages", "admin-ui");
  mkdirSync(join(designSystem, "src"), { recursive: true });
  mkdirSync(adminUi, { recursive: true });
  writeFileSync(join(designSystem, "src", "index.ts"), "export {};\n");
  writeFileSync(
    join(designSystem, "package.json"),
    JSON.stringify({ name: "@fixture/design-system", exports: { ".": "./src/index.ts" } }),
  );
  writeFileSync(
    join(designSystem, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
  );
  writeFileSync(
    join(adminUi, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { paths: { "@/*": ["../design-system/src/*"] } } }),
  );

  const aliases = detectAliases(root, {});

  assert.equal(aliases["@fixture/design-system"], join(designSystem, "src", "index.ts"));
  assert.equal(aliases["@"], join(designSystem, "src"));
});

test("explicit viewer aliases override discovery", () => {
  const root = fixture();
  mkdirSync(join(root, "custom"), { recursive: true });

  const aliases = detectAliases(root, { aliases: { "@": "custom" } });

  assert.equal(aliases["@"], join(root, "custom"));
});

test("viewer resolves an ambiguous alias from the package owning the selected CSS", () => {
  const root = fixture();
  const designSystem = join(root, "packages", "design-system");
  const prototype = join(root, "prototype");
  mkdirSync(join(designSystem, "src"), { recursive: true });
  mkdirSync(join(prototype, "src"), { recursive: true });
  writeFileSync(
    join(designSystem, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
  );
  writeFileSync(
    join(prototype, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
  );

  const aliases = detectAliases(root, {}, [designSystem]);

  assert.equal(aliases["@"], join(designSystem, "src"));
});
