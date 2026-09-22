import type { ComponentType } from "react";

export interface StoryMeta {
  title: string;
  order?: string[];
  group?: string;
  uses?: string[];
}

export interface StoryEntry {
  name: string;
  render: ComponentType;
}

export interface StoryModule {
  title: string;
  group: string;
  uses: string[];
  variants: StoryEntry[];
}

export type GlobSource = Record<string, Record<string, unknown>>;

function extractVariant(key: string, value: unknown): StoryEntry | null {
  if (typeof value === "function") {
    return { name: key, render: value as ComponentType };
  }
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { render?: unknown }).render === "function"
  ) {
    const obj = value as { name?: string; render: ComponentType };
    return { name: obj.name ?? key, render: obj.render };
  }
  return null;
}

function collectVariants(
  mod: Record<string, unknown>,
  order: string[] | undefined,
): StoryEntry[] {
  const variants: StoryEntry[] = [];
  for (const [key, value] of Object.entries(mod)) {
    if (key === "default") continue;
    const entry = extractVariant(key, value);
    if (entry) variants.push(entry);
  }
  if (order && variants.length > 0) {
    const orderMap = new Map(order.map((name, i) => [name, i]));
    variants.sort(
      (a, b) => (orderMap.get(a.name) ?? 999) - (orderMap.get(b.name) ?? 999),
    );
  }
  return variants;
}

function deriveGroup(path: string, meta: StoryMeta): string {
  if (meta.group) return meta.group;

  const p = path.replace(/\\/g, "/");
  const segments = p.split("/");
  for (let i = segments.length - 2; i >= 0; i--) {
    const seg = segments[i]!;
    if (seg.endsWith(".stories.tsx") || seg === "src") continue;
    if (seg === "." || seg === "..") continue;
    const name = seg.charAt(0).toUpperCase() + seg.slice(1);
    if (name !== "Stories") return name;
  }
  return "Components";
}

function buildModule(
  path: string,
  mod: Record<string, unknown>,
): StoryModule | null {
  const meta = mod.default as StoryMeta | undefined;
  if (!meta?.title) return null;
  const variants = collectVariants(mod, meta.order);
  if (variants.length === 0) return null;

  const group = deriveGroup(path, meta);
  const uses = Array.isArray(meta.uses) ? meta.uses : [];
  return { title: meta.title, group, uses, variants };
}

export function discoverStories(...globSources: GlobSource[]): StoryModule[] {
  const modules: StoryModule[] = [];
  for (const source of globSources) {
    for (const [path, mod] of Object.entries(source)) {
      const built = buildModule(path, mod);
      if (built) modules.push(built);
    }
  }
  return modules.sort((a, b) => a.title.localeCompare(b.title));
}
