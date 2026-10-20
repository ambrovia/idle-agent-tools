// Small helpers for text.
export function words(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}
