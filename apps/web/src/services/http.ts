const ORIGIN = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
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
      const j = await res.json();
      msg = j?.error || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const http = {
  get: <T>(p: string) => request<T>(p, { method: "GET" }),
  post: <T>(p: string, body?: any) =>
    request<T>(p, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(p: string, body?: any) =>
    request<T>(p, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(p: string, body?: any) =>
    request<T>(p, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(p: string) => request<T>(p, { method: "DELETE" }),
};
