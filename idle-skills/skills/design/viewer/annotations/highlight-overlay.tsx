import { useElementRect } from "./use-element-rect.js";

export type HighlightTone = "hover" | "selected" | "rehighlight";

export interface HighlightLayerProps {
  el: HTMLElement | null;
  label: string;
  tone: HighlightTone;
}

export function HighlightLayer({ el, label, tone }: HighlightLayerProps): React.JSX.Element | null {
  const rect = useElementRect(el);
  if (!el || !rect) return null;

  const labelTop = rect.top > 22 ? rect.top - 21 : rect.top + rect.height + 3;

  return (
    <>
      <div
        className="anno-hl-box"
        data-tone={tone}
        style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
      />
      <div className="anno-hl-label" data-tone={tone} style={{ top: labelTop, left: rect.left }}>
        {label}
      </div>
    </>
  );
}
