import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { annotationsPlugin } from "./annotations/vite-plugin-annotations.js";
import runtimeConfig from "./viewer-runtime.generated.json";

async function loadProjectTailwindVitePlugin(packageRoot: string) {
  const projectRequire = createRequire(join(packageRoot, "package.json"));
  const pluginPath = projectRequire.resolve("@tailwindcss/vite");
  const mod = await import(pathToFileURL(pluginPath).href);
  const plugin = mod.default;
  return typeof plugin === "function" ? plugin() : null;
}

async function loadProjectPostcssPlugin(packageRoot: string, name: string) {
  const projectRequire = createRequire(join(packageRoot, "package.json"));
  const pluginPath = projectRequire.resolve(name);
  const mod = await import(pathToFileURL(pluginPath).href);
  return mod.default ?? mod;
}

function absoluteTailwindContent(config: Record<string, unknown>, configPath: string) {
  const base = dirname(configPath);
  const absolutize = (value: unknown) =>
    typeof value === "string" && !isAbsolute(value) ? resolve(base, value) : value;
  if (Array.isArray(config.content)) {
    return { ...config, content: config.content.map(absolutize) };
  }
  if (config.content && typeof config.content === "object") {
    const content = config.content as Record<string, unknown>;
    return {
      ...config,
      content: {
        ...content,
        files: Array.isArray(content.files) ? content.files.map(absolutize) : content.files,
      },
    };
  }
  return config;
}

async function loadTailwindConfig(packageRoot: string, configPath: string | null) {
  if (!configPath) return {};
  const projectRequire = createRequire(join(packageRoot, "package.json"));
  const loadConfigPath = projectRequire.resolve("tailwindcss/loadConfig");
  const mod = await import(pathToFileURL(loadConfigPath).href);
  const loadConfig = mod.default ?? mod;
  return absoluteTailwindContent(loadConfig(configPath), configPath);
}

export default defineConfig(async () => {
  const projectRoot = runtimeConfig.projectRoot;
  const plugins = [react()];

  if (runtimeConfig.toolchain === "tailwind-v4") {
    try {
      const tailwind = await loadProjectTailwindVitePlugin(runtimeConfig.packageRoot ?? projectRoot);
      if (tailwind) plugins.push(tailwind);
    } catch (error) {
      console.warn(
        `[viewer] @tailwindcss/vite could not be loaded from ${projectRoot}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  plugins.push(annotationsPlugin());

  let postcss;
  if (runtimeConfig.toolchain === "tailwind-v3") {
    try {
      const tailwindcss = await loadProjectPostcssPlugin(runtimeConfig.packageRoot, "tailwindcss");
      const autoprefixer = await loadProjectPostcssPlugin(runtimeConfig.packageRoot, "autoprefixer");
      const tailwindConfig = await loadTailwindConfig(
        runtimeConfig.packageRoot,
        runtimeConfig.tailwindConfigPath,
      );
      postcss = {
        plugins: [
          tailwindcss(tailwindConfig),
          autoprefixer(),
        ],
      };
    } catch (error) {
      console.warn(
        `[viewer] Tailwind v3 plugins could not be loaded from ${runtimeConfig.packageRoot}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return {
    plugins,
    resolve: {
      alias: Object.entries(runtimeConfig.aliases ?? {})
        .sort(([left], [right]) => right.length - left.length)
        .map(([find, replacement]) => ({ find, replacement })),
    },
    css: postcss
      ? { postcss }
      : runtimeConfig.toolchain === "tailwind-v3" && runtimeConfig.postcssConfigDir
        ? { postcss: runtimeConfig.postcssConfigDir }
        : undefined,
    server: {
      port: 5173,
      fs: { allow: [projectRoot] },
    },
  };
});
