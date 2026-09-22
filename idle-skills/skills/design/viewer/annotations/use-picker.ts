import { useCallback, useEffect, useRef, useState } from "react";
import { computeAnchor, resolveAnchor } from "./resolve-anchor.js";
import { resolveComponentTarget } from "./resolve-component.js";
import type { Annotation, AnnotationTarget } from "./types.js";

export interface PickTarget {
  target: AnnotationTarget;
  el: HTMLElement;
}

export interface Crumb {
  el: HTMLElement;
  label: string;
  isCurrent: boolean;
  key: string;
}

export interface Picker {
  armed: boolean;
  arm(): void;
  disarm(): void;
  hover: PickTarget | null;
  selected: PickTarget | null;
  crumbs: Crumb[];
  selectCrumb(el: HTMLElement): void;
  reHighlightEl: HTMLElement | null;
  reHighlightMissing: boolean;
  beginReHighlight(a: Annotation): void;
  endReHighlight(): void;
  clearSelection(): void;
}

export function toPickTarget(el: HTMLElement, root: HTMLElement): PickTarget {
  const target = resolveComponentTarget(el);
  target.anchor = computeAnchor(el, root);
  return { target, el };
}

export function buildCrumbs(selectedEl: HTMLElement, root: HTMLElement): Crumb[] {
  const raw: { el: HTMLElement; label: string }[] = [];
  let cur: HTMLElement | null = selectedEl;
  while (cur && cur !== root) {
    const t = resolveComponentTarget(cur);
    raw.push({ el: cur, label: t.component });
    cur = cur.parentElement;
  }
  raw.reverse();

  const deduped: Crumb[] = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i]!;
    let label = entry.label;
    const prev = deduped[deduped.length - 1];
    if (prev && prev.label === label) {
      const fallback = resolveComponentTarget(entry.el).element;
      if (prev.label === fallback) continue;
      label = fallback;
    }
    deduped.push({
      el: entry.el,
      label,
      isCurrent: entry.el === selectedEl,
      key: `${i}-${label}`,
    });
  }
  return deduped;
}

export function usePicker(storyRoot: HTMLElement | null): Picker {
  const [armed, setArmed] = useState(false);
  const [hover, setHover] = useState<PickTarget | null>(null);
  const [selected, setSelected] = useState<PickTarget | null>(null);
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [reHighlightEl, setReHighlightEl] = useState<HTMLElement | null>(null);
  const [reHighlightMissing, setReHighlightMissing] = useState(false);

  const listenersRef = useRef<{ move: (e: MouseEvent) => void; click: (e: MouseEvent) => void } | null>(null);

  const clearSelection = useCallback(() => {
    setSelected(null);
    setCrumbs([]);
  }, []);

  const disarm = useCallback(() => {
    if (listenersRef.current && storyRoot) {
      storyRoot.removeEventListener("mousemove", listenersRef.current.move);
      storyRoot.removeEventListener("click", listenersRef.current.click, true);
      listenersRef.current = null;
    }
    setArmed(false);
    setHover(null);
  }, [storyRoot]);

  const arm = useCallback(() => {
    if (!storyRoot) return;
    disarm();

    const move = (e: MouseEvent): void => {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      setHover(toPickTarget(el, storyRoot));
    };

    const click = (e: MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      const pick = toPickTarget(el, storyRoot);
      setSelected(pick);
      setCrumbs(buildCrumbs(el, storyRoot));
      storyRoot.removeEventListener("mousemove", move);
      storyRoot.removeEventListener("click", click, true);
      listenersRef.current = null;
      setArmed(false);
      setHover(null);
    };

    storyRoot.addEventListener("mousemove", move);
    storyRoot.addEventListener("click", click, true);
    listenersRef.current = { move, click };
    setArmed(true);
  }, [storyRoot, disarm]);

  const selectCrumb = useCallback((el: HTMLElement) => {
    if (!storyRoot) return;
    const pick = toPickTarget(el, storyRoot);
    setSelected(pick);
    setCrumbs(buildCrumbs(el, storyRoot));
  }, [storyRoot]);

  const beginReHighlight = useCallback((a: Annotation) => {
    if (!storyRoot || !a.target.anchor) {
      setReHighlightMissing(true);
      setReHighlightEl(null);
      return;
    }
    const el = resolveAnchor(a.target.anchor, storyRoot);
    if (el) {
      setReHighlightEl(el);
      setReHighlightMissing(false);
    } else {
      setReHighlightEl(null);
      setReHighlightMissing(true);
    }
  }, [storyRoot]);

  const endReHighlight = useCallback(() => {
    setReHighlightEl(null);
    setReHighlightMissing(false);
  }, []);

  useEffect(() => {
    if (!storyRoot) return;
    const observer = new MutationObserver(() => {
      if (selected && !selected.el.isConnected) {
        setSelected(null);
        setCrumbs([]);
      }
      if (hover && !hover.el.isConnected) {
        setHover(null);
      }
      if (reHighlightEl && !reHighlightEl.isConnected) {
        setReHighlightEl(null);
        setReHighlightMissing(true);
      }
    });
    observer.observe(storyRoot, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [storyRoot, selected, hover, reHighlightEl]);

  useEffect(() => {
    return () => {
      if (listenersRef.current && storyRoot) {
        storyRoot.removeEventListener("mousemove", listenersRef.current.move);
        storyRoot.removeEventListener("click", listenersRef.current.click, true);
      }
    };
  }, [storyRoot]);

  return {
    armed,
    arm,
    disarm,
    hover,
    selected,
    crumbs,
    selectCrumb,
    reHighlightEl,
    reHighlightMissing,
    beginReHighlight,
    endReHighlight,
    clearSelection,
  };
}
