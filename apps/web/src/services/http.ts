// apps/web/src/services/api/http.ts
const normalizeOrigin = (value?: string | null) =>
  value ? value.replace(/\/$/, "") : null;

const ORIGIN =
  normalizeOrigin(process.env.NEXT_PUBLIC_API_URL) ||
  normalizeOrigin(process.env.NEXT_PUBLIC_API_BASE_URL) ||
  normalizeOrigin(process.env.NEXT_PUBLIC_API) ||
  "http://localhost:4000";

const API = ORIGIN.endsWith("/api") ? ORIGIN : `${ORIGIN}/api`;

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// helper
const isFormData = (v: any): v is FormData =>
  typeof FormData !== "undefined" && v instanceof FormData;

async function request<T>(
  path: string,
  opts: RequestInit & { method?: HttpMethod; body?: any } = {}
): Promise<T> {
  const url = `${API}${path}`;

  // جهّز الهيدرز بدون فرض الـ Content-Type لو body = FormData
  const headers = new Headers(opts.headers || {});
  let body: BodyInit | undefined = undefined;

  if (opts.body !== undefined && opts.body !== null) {
    if (isFormData(opts.body)) {
      body = opts.body; // اترك المتصفح يحدد Content-Type
    } else if (typeof opts.body === "string") {
      headers.set("Content-Type", "application/json");
      body = opts.body; // مفترض تكون جاهزة كسلسلة
    } else {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(opts.body);
    }
  }

  const res = await fetch(url, {
    ...opts,
    headers,
    body,
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
  post: <T>(p: string, body?: any) => request<T>(p, { method: "POST", body }),
  put: <T>(p: string, body?: any) => request<T>(p, { method: "PUT", body }),
  patch: <T>(p: string, body?: any) => request<T>(p, { method: "PATCH", body }),
  delete: <T>(p: string) => request<T>(p, { method: "DELETE" }),
};
export { API, ORIGIN };
