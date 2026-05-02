// Verwaltet die Backend-URL des Pi-Backends. Pro Gerät in localStorage.
// (Das ist eine Geräte-Einstellung — nicht in DB, weil das Backend selbst
//  ja die DB hostet.)

const STORAGE_KEY = "mcc.backend.url";
const STATUS_EVENT = "mcc.backend.url.changed";

function defaultUrl(): string {
  // Build-Env hat Vorrang, falls explizit gesetzt
  const fromEnv = (import.meta.env.VITE_API_BASE_URL ?? "").toString().trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "http://localhost:8787";
}

export function getBackendUrl(): string {
  if (typeof window === "undefined") return defaultUrl();
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return (stored ?? defaultUrl()).replace(/\/$/, "");
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
  db: { ok: boolean; wal: boolean; path: string };
  masterKey: { present: boolean };
  uptimeSec: number;
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthInfo> {
  const url = `${getBackendUrl()}/health`;
  const res = await fetch(url, { signal, credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as HealthInfo;
}
