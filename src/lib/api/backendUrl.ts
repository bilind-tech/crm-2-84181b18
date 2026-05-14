// Verwaltet die Backend-URL des Pi-Backends. Pro Gerät in localStorage.
// (Das ist eine Geräte-Einstellung — nicht in DB, weil das Backend selbst
//  ja die DB hostet.)

const STORAGE_KEY = "mcc.backend.url";
const STATUS_EVENT = "mcc.backend.url.changed";
const HEALTH_TIMEOUT_MS = 4_000;

function defaultUrl(): string {
  // Build-Env hat Vorrang, falls explizit gesetzt
  const fromEnv = (import.meta.env.VITE_API_BASE_URL ?? "").toString().trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  // Production-Build (vom Pi-Backend ausgeliefert): API liegt am gleichen Origin.
  if (typeof window !== "undefined" && import.meta.env.PROD) {
    return window.location.origin.replace(/\/$/, "");
  }
  return "http://localhost:8787";
}

export function getBackendUrl(): string {
  if (typeof window === "undefined") return defaultUrl();
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return (stored ?? defaultUrl()).replace(/\/$/, "");
}

/** True wenn der User explizit eine Backend-URL hinterlegt hat (oder VITE_API_BASE_URL gesetzt ist). */
export function isBackendUrlExplicit(): boolean {
  if (typeof window === "undefined") return false;
  if (import.meta.env.PROD) return true;
  if (window.localStorage.getItem(STORAGE_KEY)) return true;
  const fromEnv = (import.meta.env.VITE_API_BASE_URL ?? "").toString().trim();
  return fromEnv.length > 0;
}

export function isLocalPreviewFallbackAllowed(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  if (host.endsWith(".lovableproject.com") || host.endsWith(".lovable.app")) return true;
  const fromEnv = (import.meta.env.VITE_API_BASE_URL ?? "").toString().trim();
  if (fromEnv) return false;
  return import.meta.env.DEV || host === "localhost" || host === "127.0.0.1";
}

export function setBackendUrl(url: string): void {
  if (typeof window === "undefined") return;
  const clean = url.trim().replace(/\/$/, "");
  if (clean) {
    window.localStorage.setItem(STORAGE_KEY, clean);
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  window.dispatchEvent(new CustomEvent(STATUS_EVENT));
}

export function subscribeBackendUrl(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (): void => cb();
  window.addEventListener(STATUS_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(STATUS_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export interface HealthInfo {
  status: string;
  version: string;
  schemaVersion: number;
  db: { ok: boolean; wal: boolean; path?: string };
  masterKey?: { present: boolean };
  uptimeSec: number;
  maintenance?: { active: boolean; reason?: string };
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthInfo> {
  const ctrl = new AbortController();
  const timeout = window.setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const url = `${getBackendUrl()}/health`;
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: "include" });
    // 503 im Wartungsmodus liefert JSON-Body mit status "maintenance" — auswerten statt werfen.
    if (!res.ok && res.status !== 503) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as HealthInfo;
  } catch (err) {
    if (ctrl.signal.aborted && !signal?.aborted) {
      throw new Error("Backend-Check hat zu lange gedauert");
    }
    throw err;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}
