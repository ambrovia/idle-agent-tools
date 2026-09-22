import { resolveComponentTarget } from "./resolve-component.js";
import type { AnnotationAnchor } from "./types.js";

export function computeAnchor(el: HTMLElement, root: HTMLElement): AnnotationAnchor {
  const path: number[] = [];
  let cur: HTMLElement | null = el;
  while (cur && cur !== root) {
    const parent = cur.parentElement;
    if (!parent) break;
    path.unshift(Array.prototype.indexOf.call(parent.children, cur));
    cur = parent;
  }
  const target = resolveComponentTarget(el);
  return { path, component: target.component, element: target.element };
}

export function resolveAnchor(anchor: AnnotationAnchor, root: HTMLElement): HTMLElement | null {
  let cur: Element | null = root;
  let ok = true;
  for (const idx of anchor.path) {
    const next = cur?.children[idx];
    if (!next) { ok = false; break; }
    cur = next;
  }
  if (ok && cur && cur !== root && cur instanceof HTMLElement) return cur;

  const matches: HTMLElement[] = [];
  for (const candidate of root.querySelectorAll<HTMLElement>("*")) {
    const t = resolveComponentTarget(candidate);
    if (t.component === anchor.component && t.element === anchor.element) {
      matches.push(candidate);
    }
  }
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0] ?? null;

  let best: HTMLElement | null = null;
  let bestDist = Infinity;
  for (const candidate of matches) {
    const dist = pathDistance(computePath(candidate, root), anchor.path);
    if (dist < bestDist) { bestDist = dist; best = candidate; }
  }
  return best;
}

function computePath(el: HTMLElement, root: HTMLElement): number[] {
  const path: number[] = [];
  let cur: HTMLElement | null = el;
  while (cur && cur !== root) {
    const parent = cur.parentElement;
    if (!parent) break;
    path.unshift(Array.prototype.indexOf.call(parent.children, cur));
    cur = parent;
  }
  return path;
}

function pathDistance(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  let dist = 0;
  for (let i = 0; i < len; i++) {
    const av = a[i]; const bv = b[i];
    if (av === undefined || bv === undefined) dist += 100;
    else dist += Math.abs(av - bv);
  }
  return dist;
}
