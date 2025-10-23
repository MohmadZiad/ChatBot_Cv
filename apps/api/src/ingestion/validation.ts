// apps/api/src/ingestion/validation.ts
export const MIN_CV_TEXT_LENGTH = 200;

const WORD_CHAR_REGEX = /[\p{L}\p{N}]/gu;

export function normalizeCvText(
  text: unknown,
  minLength = MIN_CV_TEXT_LENGTH
): string | null {
  if (typeof text !== "string") return null;

  const normalized = text.replace(/\u0000/g, "").trim();
  if (normalized.length < minLength) return null;

  const wordChars = normalized.match(WORD_CHAR_REGEX);
  if (!wordChars) return null;
  const minimumWordChars = Math.min(Math.floor(minLength / 2), 120);
  if (wordChars.length < minimumWordChars) return null;

  return normalized;
}

export function isCvTextUsable(
  text: unknown,
  minLength = MIN_CV_TEXT_LENGTH
): text is string {
  return normalizeCvText(text, minLength) !== null;
}
