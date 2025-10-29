// apps/web/src/services/api/http.ts
const normalizeOrigin = (value?: string | null) => {
  if (!value) return null;
  return value.replace(/\/$/, "");
};

const ORIGIN =
  normalizeOrigin(process.env.NEXT_PUBLIC_API_URL) ||
  normalizeOrigin(process.env.NEXT_PUBLIC_API_BASE_URL) ||
  normalizeOrigin(process.env.NEXT_PUBLIC_API) ||
  "http://localhost:4000";

const API = `${ORIGIN}/api`;

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function request<T>(
  path: string,
  opts: RequestInit & { method?: HttpMethod } = {}
): Promise<T> {
  const url = `${API}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    cache: "no-store",
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const j = await res.json();
        msg = j?.message || j?.error || j?.detail || msg;
      } else {
        msg = (await res.text()) || msg;
      }
    } catch {}
    throw new Error(msg);
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

export const http = {
  get: <T>(p: string) => request<T>(p, { method: "GET" }),
  post: <T>(p: string, body?: any) =>
    request<T>(p, { method: "POST", body: JSON.stringify(body ?? {}) }),
  put: <T>(p: string, body?: any) =>
    request<T>(p, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  patch: <T>(p: string, body?: any) =>
    request<T>(p, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  delete: <T>(p: string) => request<T>(p, { method: "DELETE" }),
};
export { API, ORIGIN };
