import { useCallback, useEffect, useRef, useState } from "react";
import { usePicker } from "./use-picker.js";
import { HighlightLayer } from "./highlight-overlay.js";
import { InspectorRail } from "./inspector-rail.js";
import { resolveComponentTarget } from "./resolve-component.js";
import { computeAnchor } from "./resolve-anchor.js";
import { isRectOffscreen, measureRect } from "./use-element-rect.js";
import type { AnnotationState, AnnotationTarget } from "./types.js";

interface AnnotationOverlayProps {
  story: string;
  variant: string;
  storyRoot: HTMLElement;
}

function variantForElement(el: HTMLElement, fallback: string): string {
  const section = el.closest(".demo-section[data-variant]");
  if (section) {
    const v = section.getAttribute("data-variant");
    if (v) return v;
  }
  const titleSection = el.closest(".demo-section");
  if (titleSection) {
    const title = titleSection.querySelector(".demo-section-title");
    if (title?.textContent) return title.textContent.trim();
  }
  return fallback;
}

export function AnnotationOverlay({ story, variant, storyRoot }: AnnotationOverlayProps) {
  const picker = usePicker(storyRoot);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [annoState, setAnnoState] = useState<AnnotationState | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [measureKey, setMeasureKey] = useState(0);
  const armButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    fetch("/__annotations")
      .then((r) => r.json())
      .then((data: { state: AnnotationState }) => setAnnoState(data.state))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      setMeasureKey((k) => k + 1);
    });
    observer.observe(storyRoot);
    return () => observer.disconnect();
  }, [storyRoot]);

  useEffect(() => {
    document.body.classList.add("anno-active");
    return () => document.body.classList.remove("anno-active");
  }, []);

  useEffect(() => {
    const gutter = collapsed ? "72px" : "344px";
    document.body.style.setProperty("--anno-rail-gutter", gutter);
    return () => {
      document.body.style.removeProperty("--anno-rail-gutter");
    };
  }, [collapsed]);

  useEffect(() => {
    if (picker.reHighlightEl) {
      const rect = measureRect(picker.reHighlightEl);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (isRectOffscreen(rect, vw, vh)) {
        picker.reHighlightEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [picker.reHighlightEl]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (picker.selected) {
          picker.clearSelection();
        } else if (picker.armed) {
          picker.disarm();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && picker.selected && note.trim()) {
        handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [picker.selected, picker.armed, note]);

  const handleSave = useCallback(async () => {
    if (!picker.selected || !note.trim()) return;
    setSaving(true);
    setError(null);
    const target: AnnotationTarget = {
      ...picker.selected.target,
      anchor: computeAnchor(picker.selected.el, storyRoot),
    };
    const elementVariant = variantForElement(picker.selected.el, variant);
    try {
      const res = await fetch("/__annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story, variant: elementVariant, note: note.trim(), target }),
      });
      const data = (await res.json()) as { state: AnnotationState };
      setAnnoState(data.state);
      picker.clearSelection();
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [picker.selected, note, story, variant, storyRoot]);

  const handleNewIteration = useCallback(async () => {
    try {
      const res = await fetch("/__annotations/round", { method: "POST" });
      const data = (await res.json()) as { state: AnnotationState };
      setAnnoState(data.state);
    } catch {}
  }, []);

  const round = annoState?.currentRound ?? 1;
  const currentRoundAnnotations =
    annoState?.rounds.find((r) => r.round === round)?.annotations ?? [];

  const reHighlightLabel = picker.reHighlightEl
    ? resolveComponentTarget(picker.reHighlightEl).component
    : "";

  return (
    <>
      <InspectorRail
        picker={picker}
        round={round}
        annotations={currentRoundAnnotations}
        note={note}
        onNoteChange={setNote}
        onSave={handleSave}
        saving={saving}
        error={error}
        onNewIteration={handleNewIteration}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        armButtonRef={armButtonRef}
      />
      {picker.armed && picker.hover && (
        <HighlightLayer
          key={`hover-${measureKey}`}
          el={picker.hover.el}
          label={`${picker.hover.target.component} · ${picker.hover.target.element}`}
          tone="hover"
        />
      )}
      {picker.selected && !picker.hover && (
        <HighlightLayer
          key={`selected-${measureKey}`}
          el={picker.selected.el}
          label={`${picker.selected.target.component} · ${picker.selected.target.element}`}
          tone="selected"
        />
      )}
      {picker.reHighlightEl && (
        <HighlightLayer
          key={`rehighlight-${measureKey}`}
          el={picker.reHighlightEl}
          label={`${reHighlightLabel} · ${resolveComponentTarget(picker.reHighlightEl).element}`}
          tone="rehighlight"
        />
      )}
    </>
  );
}
