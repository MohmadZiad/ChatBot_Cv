// apps/api/src/ingestion/validation.ts
export function isCvTextUsable(text: unknown, minLength = 200): text is string {
  if (typeof text !== "string") return false;
  const normalized = text.trim();
  return normalized.length >= minLength;
}
