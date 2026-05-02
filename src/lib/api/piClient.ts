// HTTP-Client gegen das Pi-Backend (echtes Backend, NICHT Mock).
// Nutzt getBackendUrl() + Cookie-Auth.

import { getBackendUrl } from "./backendUrl";

export class PiApiError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type FetchInit = Omit<RequestInit, "body"> & { body?: unknown };

async function request<T>(method: string, path: string, init: FetchInit = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  let body: BodyInit | undefined;

  if (init.body !== undefined) {
    if (init.body instanceof FormData) {
      body = init.body;
    } else {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(init.body);
    }
  }

  let res: Response;
  try {
    res = await fetch(`${getBackendUrl()}${path}`, {
      method,
      headers,
      body,
      credentials: "include",
      signal: init.signal,
    });
  } catch (err) {
    throw new PiApiError(
      err instanceof Error ? err.message : "Backend nicht erreichbar",
      0,
    );
  }

  if (res.status === 204) return undefined as T;

  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const msg =
      typeof data === "string"
        ? data
        : ((data as { error?: string; message?: string })?.error ??
          (data as { message?: string })?.message ??
          res.statusText);
    throw new PiApiError(msg, res.status, data);
  }
  return data as T;
}

export const piApi = {
  get: <T>(p: string, init?: FetchInit) => request<T>("GET", p, init),
  post: <T>(p: string, body?: unknown) => request<T>("POST", p, { body }),
  patch: <T>(p: string, body?: unknown) => request<T>("PATCH", p, { body }),
  delete: <T>(p: string) => request<T>("DELETE", p),
};
