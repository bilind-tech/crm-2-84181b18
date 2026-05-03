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
    throw new PiApiError(err instanceof Error ? err.message : "Backend nicht erreichbar", 0);
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
  put: <T>(p: string, body?: unknown) => request<T>("PUT", p, { body }),
  delete: <T>(p: string) => request<T>("DELETE", p),
};

/**
 * Multipart-POST mit Upload-Progress (XHR statt fetch).
 * `onProgress` bekommt einen Wert zwischen 0 und 1.
 */
export function postWithProgress<T>(
  path: string,
  formData: FormData,
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${getBackendUrl()}${path}`, true);
    xhr.withCredentials = true;
    xhr.responseType = "text";

    xhr.upload.onprogress = (e) => {
      if (!onProgress) return;
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.min(1, e.loaded / e.total));
      }
    };

    xhr.onerror = () => reject(new PiApiError("Backend nicht erreichbar", 0));
    xhr.ontimeout = () => reject(new PiApiError("Zeitüberschreitung", 0));
    xhr.onabort = () => reject(new PiApiError("Abgebrochen", 0));

    xhr.onload = () => {
      const ct = xhr.getResponseHeader("content-type") ?? "";
      const raw = xhr.responseText;
      const data: unknown = ct.includes("application/json") && raw ? JSON.parse(raw) : raw;
      if (xhr.status >= 200 && xhr.status < 300) {
        if (xhr.status === 204) return resolve(undefined as T);
        return resolve(data as T);
      }
      const msg =
        typeof data === "string"
          ? data || xhr.statusText
          : ((data as { error?: string; message?: string })?.error ??
            (data as { message?: string })?.message ??
            xhr.statusText);
      reject(new PiApiError(msg, xhr.status, data));
    };

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.send(formData);
  });
}
