// apps/api/src/utils/debug.ts
const DEBUG_RAW = process.env.DEBUG || "";

const TOKENS = DEBUG_RAW.split(/[,\s]+/)
  .map((token) => token.trim().toLowerCase())
  .filter(Boolean);

const ALWAYS_ON = new Set(["*", "1", "true", "yes"]);

function matchesScope(scope: string, token: string) {
  if (ALWAYS_ON.has(token)) return true;

  const normalizedScope = scope.replace(/:/g, ".");
  const normalizedToken = token.replace(/:/g, ".");

  if (normalizedToken.endsWith("*")) {
    const base = normalizedToken.slice(0, -1);
    if (!base) return true;
    return normalizedScope.startsWith(base);
  }

  if (normalizedScope === normalizedToken) return true;
  return normalizedScope.startsWith(`${normalizedToken}.`);
}

function isEnabled(scope: string) {
  if (!TOKENS.length) return false;
  const normalizedScope = scope.toLowerCase();
  return TOKENS.some((token) => matchesScope(normalizedScope, token));
}

export function debugLog(
  scope: string,
  message: string,
  data?: Record<string, unknown>
) {
  if (!isEnabled(scope)) return;
  const payload = data ? { ...data } : undefined;
  if (payload) {
    console.debug(`[${scope}] ${message}`, payload);
  } else {
    console.debug(`[${scope}] ${message}`);
  }
}
