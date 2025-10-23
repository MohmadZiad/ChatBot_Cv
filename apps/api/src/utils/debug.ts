// apps/api/src/utils/debug.ts
const DEBUG_RAW = process.env.DEBUG || "";

function isEnabled(scope: string) {
  if (!DEBUG_RAW) return false;
  const tokens = DEBUG_RAW.split(/[,\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return false;
  if (tokens.includes("*") || tokens.includes("1")) return true;
  if (tokens.some((t) => t === "true" || t === "yes")) return true;
  return tokens.some((token) => scope.toLowerCase().startsWith(token));
}

export function debugLog(scope: string, message: string, data?: Record<string, unknown>) {
  if (!isEnabled(scope)) return;
  const payload = data ? { ...data } : undefined;
  if (payload) {
    console.debug(`[${scope}] ${message}`, payload);
  } else {
    console.debug(`[${scope}] ${message}`);
  }
}
