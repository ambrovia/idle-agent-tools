import { useLayoutEffect, useState } from "react";

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function measureRect(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function isRectOffscreen(rect: Rect, viewportW: number, viewportH: number): boolean {
  return rect.top < 0 || rect.left < 0 || rect.top + rect.height > viewportH || rect.left + rect.width > viewportW;
}

export function useElementRect(el: HTMLElement | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(() => el?.isConnected ? measureRect(el) : null);

  useLayoutEffect(() => {
    if (!el?.isConnected) { setRect(null); return; }
    setRect(measureRect(el));

    let frame = 0;
    const onChange = (): void => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setRect(el.isConnected ? measureRect(el) : null);
      });
    };

    window.addEventListener("scroll", onChange, true);
    window.addEventListener("resize", onChange);
    return () => {
      window.removeEventListener("scroll", onChange, true);
      window.removeEventListener("resize", onChange);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [el]);

  return rect;
}
