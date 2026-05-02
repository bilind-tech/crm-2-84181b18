// API-Client. Routet basierend auf dem Pfad-Prefix:
// - /auth/* und /einstellungen/* -> echtes Pi-Backend (Cookie-Auth)
// - alles andere -> Mock-Backend (in-memory)
//
// Wenn das Pi-Backend nicht erreichbar ist und VITE_USE_MOCK !== "false",
// fällt der Auth-/Einstellungs-Pfad still zurück auf das Mock-Backend.
// So funktioniert die App im Demo-Modus unverändert weiter.
//
// Override per Env:
//   VITE_USE_MOCK=false     -> nie Mock (alles ans Pi-Backend)
//   VITE_API_BASE_URL=...   -> Default-Backend-URL (Pi)

import { mockBackend } from "@/lib/mock/backend";
import { piApi, PiApiError } from "@/lib/api/piClient";

const USE_MOCK =
  (import.meta.env.VITE_USE_MOCK ?? "true").toString().toLowerCase() !== "false";

export class ApiError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// Step 1: nur diese Auth-/Einstellungs-Pfade laufen schon ans Pi-Backend.
// Alle anderen /einstellungen/*-Pfade (Vorlagen, Backup-Historie, …)
// bleiben im Mock, bis ihr jeweiliger Step das Backend liefert.
const PI_AUTH_PATHS = new Set([
  "/auth/me",
  "/auth/setup",
  "/auth/login",
  "/auth/logout",
  "/auth/passwort-aendern",
]);
const PI_SETTINGS_PATHS = new Set([
  "/einstellungen/firma",
  "/einstellungen/smtp",
  "/einstellungen/smtp/test",
  "/einstellungen/smtp/passwort",
  "/einstellungen/nummernkreise",
  "/einstellungen/sicherheit",
  "/einstellungen/erscheinung",
  "/einstellungen/backup",
  "/einstellungen/google-drive",
  "/einstellungen/google-drive/disconnect",
  "/einstellungen/mahnung",
  "/einstellungen/dauerauftrag",
  "/einstellungen/steuer",
  "/einstellungen/stundenzettel",
  "/einstellungen/sitzungen",
  "/einstellungen/sitzungen/alle-beenden",
]);

function isPiPath(p: string): boolean {
  if (PI_AUTH_PATHS.has(p) || PI_SETTINGS_PATHS.has(p)) return true;
  // Sub-Pfade z.B. /einstellungen/sitzungen/<token>
  if (p.startsWith("/einstellungen/sitzungen/")) return true;
  return false;
}

async function viaPi<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    switch (method) {
      case "GET":
        return await piApi.get<T>(path);
      case "POST":
        return await piApi.post<T>(path, body);
      case "PATCH":
        return await piApi.patch<T>(path, body);
      case "PUT":
        return await piApi.patch<T>(path, body); // PUT als PATCH semantisch
      case "DELETE":
        return await piApi.delete<T>(path);
      default:
        throw new Error(`Methode nicht unterstützt: ${method}`);
    }
  } catch (err) {
    if (err instanceof PiApiError) {
      // Backend offline (Status 0) -> ggf. Fallback auf Mock
      if (err.status === 0 && USE_MOCK) {
        return mockBackend<T>(method, path, body);
      }
      throw new ApiError(err.message, err.status, err.body);
    }
    throw err;
  }
}

export const api = {
  isMock: USE_MOCK,
  get: <T>(path: string) =>
    isPiPath(path) ? viaPi<T>("GET", path) : USE_MOCK ? mockBackend<T>("GET", path) : viaPi<T>("GET", path),
  post: <T>(path: string, body?: unknown) =>
    isPiPath(path) ? viaPi<T>("POST", path, body) : USE_MOCK ? mockBackend<T>("POST", path, body) : viaPi<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) =>
    isPiPath(path) ? viaPi<T>("PATCH", path, body) : USE_MOCK ? mockBackend<T>("PATCH", path, body) : viaPi<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) =>
    isPiPath(path) ? viaPi<T>("PUT", path, body) : USE_MOCK ? mockBackend<T>("PUT", path, body) : viaPi<T>("PUT", path, body),
  delete: <T>(path: string) =>
    isPiPath(path) ? viaPi<T>("DELETE", path) : USE_MOCK ? mockBackend<T>("DELETE", path) : viaPi<T>("DELETE", path),
};
