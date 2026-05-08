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

// Globaler Listener für 401-Antworten. Auth-Provider hängt sich hier ein,
// um beim "unauthenticated" zurück auf den LockScreen zu fallen, statt
// einzelne UI-Bereiche leer stehen zu lassen.
type UnauthListener = () => void;
const unauthListeners = new Set<UnauthListener>();
export function onUnauthenticated(cb: UnauthListener): () => void {
  unauthListeners.add(cb);
  return () => unauthListeners.delete(cb);
}
function notifyUnauth(): void {
  for (const cb of unauthListeners) {
    try { cb(); } catch { /* ignore */ }
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
    if (res.status === 401 && !path.startsWith("/auth/")) {
      notifyUnauth();
    }
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
 * Mappt API-Fehler in nutzerfreundliche Texte. Statt nackte „unauthenticated" /
 * „drive-not-connected" / Stack-Traces zeigen wir Klartext mit Lösungshinweis.
 * In Toasts immer `errorToMessage(err)` nutzen, nie `err.message` direkt.
 */
export function errorToMessage(err: unknown, fallback = "Aktion fehlgeschlagen"): string {
  if (!(err instanceof PiApiError)) {
    if (err instanceof Error) return err.message;
    return fallback;
  }
  // Backend liefert oft `{ error: "code", message: "Klartext" }`. Beides nutzen.
  const body = err.body as { error?: string; message?: string } | undefined;
  const code = body?.error ?? err.message;
  switch (code) {
    case "drive-not-connected":
      return (
        body?.message ??
        "Google Drive ist nicht verbunden. Der Beleg liegt sicher lokal auf dem Pi — verbinde Drive in Einstellungen → Google Drive."
      );
    case "drive-token-expired":
    case "invalid_grant":
      return "Google-Drive-Verbindung abgelaufen. Bitte in Einstellungen → Google Drive neu verbinden.";
    case "drive-credentials-missing":
      return (
        body?.message ??
        "OAuth-Client-ID oder Secret fehlen. Bitte zuerst im Verbinden-Dialog ausfüllen."
      );
    case "drive-connect-failed":
      return body?.message ?? "Verbindung zu Google fehlgeschlagen.";
    case "unauthenticated":
      return "Sitzung abgelaufen — bitte erneut anmelden.";
    case "needs-setup":
      return "Bitte zuerst die Ersteinrichtung abschließen.";
    case "validation":
      return body?.message ?? "Eingabe ungültig — bitte Felder prüfen.";
  }
  if (err.status === 0) return "Backend nicht erreichbar. Läuft der Pi und ist er im selben Netzwerk?";
  if (err.status === 401) return "Nicht angemeldet — bitte erneut einloggen.";
  if (err.status === 403) return "Keine Berechtigung für diese Aktion.";
  if (err.status === 404) return "Nicht gefunden.";
  if (err.status === 409) return body?.message ?? code ?? fallback;
  if (err.status >= 500) return body?.message ?? "Server-Fehler. Bitte später erneut versuchen.";
  return body?.message ?? code ?? fallback;
}

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
