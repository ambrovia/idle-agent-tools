import { readState, appendAnnotation, startRound } from "./annotation-store.js";
import type { AnnotationTarget } from "./types.js";

function isValidTarget(t: unknown): t is AnnotationTarget {
  if (typeof t !== "object" || t === null) return false;
  const obj = t as Record<string, unknown>;
  return (
    typeof obj.component === "string" &&
    typeof obj.element === "string" &&
    (obj.dsComponent === null || typeof obj.dsComponent === "string")
  );
}

function isValidBody(
  b: unknown,
): b is { story: string; variant: string; note: string; target: AnnotationTarget } {
  if (typeof b !== "object" || b === null) return false;
  const obj = b as Record<string, unknown>;
  return (
    typeof obj.story === "string" &&
    typeof obj.variant === "string" &&
    typeof obj.note === "string" &&
    isValidTarget(obj.target)
  );
}

export function handleAnnotationRequest(
  file: string,
  method: string,
  pathname: string,
  body: unknown,
  clock: () => string,
  idgen: () => string,
): { status: number; json: unknown } {
  const normalized = pathname.endsWith("/") && pathname.length > 1
    ? pathname.slice(0, -1)
    : pathname;

  if (normalized === "/__annotations" && method === "GET") {
    return { status: 200, json: { state: readState(file) } };
  }

  if (normalized === "/__annotations" && method === "POST") {
    if (!isValidBody(body)) {
      return { status: 400, json: { error: "Invalid request body" } };
    }
    const state = appendAnnotation(file, body, clock(), idgen());
    return { status: 200, json: { state } };
  }

  if (normalized === "/__annotations/round" && method === "POST") {
    const state = startRound(file, clock());
    return { status: 200, json: { state } };
  }

  return { status: 404, json: { error: "Not found" } };
}
