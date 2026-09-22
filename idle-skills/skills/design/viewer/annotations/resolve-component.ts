import type { AnnotationTarget } from "./types.js";

interface ReactFiberNode {
  type: unknown;
  return: ReactFiberNode | null;
}

function ownText(node: Element): string {
  let text = "";
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) text += child.textContent ?? "";
  }
  return text.trim();
}

function buildElementDescriptor(node: Element): string {
  const tag = node.tagName.toLowerCase();
  const classes = Array.from(node.classList)
    .slice(0, 3)
    .map((c) => `.${c}`)
    .join("");

  const hints: string[] = [];
  for (const attr of ["role", "aria-label", "type", "placeholder", "data-ds-component", "name", "href"]) {
    const val = node.getAttribute(attr);
    if (val) { hints.push(`${attr}=${val}`); break; }
  }

  const direct = ownText(node);
  if (direct.length > 0 && direct.length <= 40) {
    hints.push(`"${direct}"`);
  } else if (direct.length > 40) {
    hints.push(`"${direct.slice(0, 37)}…"`);
  }

  const detail = hints.length > 0 ? ` ${hints.join(" ")}` : "";
  return `${tag}${classes}${detail}`;
}

export function resolveComponentTarget(node: Element): AnnotationTarget {
  const dsComponent =
    node
      .closest("[data-ds-component]")
      ?.getAttribute("data-ds-component") ?? null;

  let component: string | null = null;

  const fiberKey = Object.keys(node).find((k) =>
    k.startsWith("__reactFiber$"),
  );
  if (fiberKey) {
    let fiber: ReactFiberNode | null = (node as Record<string, unknown>)[
      fiberKey
    ] as ReactFiberNode;
    while (fiber) {
      if (typeof fiber.type === "function") {
        const type = fiber.type as { displayName?: string; name?: string };
        const name = type.displayName || type.name;
        if (name) {
          component = name;
          break;
        }
      }
      fiber = fiber.return;
    }
  }

  if (!component) {
    component = dsComponent;
  }
  if (!component) {
    component = "unknown";
  }

  const element = buildElementDescriptor(node);

  return { component, dsComponent, element };
}
