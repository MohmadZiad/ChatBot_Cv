// apps/web/src/services/api/http.ts
const ORIGIN = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
const API = `${ORIGIN}/api`;

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function request<T>(
  path: string,
  opts: RequestInit & { method?: HttpMethod } = {}
): Promise<T> {
  const url = `${API}${path}`;
  const isFormData = opts.body instanceof FormData;

  const res = await fetch(url, {
    ...opts,
    headers: {
      Accept: "application/json",
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(opts.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      msg = data?.message || data?.error || data?.detail || JSON.stringify(data);
    } catch {
      try { msg = await res.text(); } catch {}
    }
    throw new Error(`${opts.method || "GET"} ${path} → ${msg}`);
  }
  return res.json() as Promise<T>;
}

export const http = {
  get: <T>(p: string) => request<T>(p, { method: "GET" }),
  post: <T>(p: string, body?: any) =>
    request<T>(p, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body) }),
  put: <T>(p: string, body?: any) =>
    request<T>(p, { method: "PUT", body: body instanceof FormData ? body : JSON.stringify(body) }),
  patch: <T>(p: string, body?: any) =>
    request<T>(p, { method: "PATCH", body: body instanceof FormData ? body : JSON.stringify(body) }),
  delete: <T>(p: string) => request<T>(p, { method: "DELETE" }),
};
