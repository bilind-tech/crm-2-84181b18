// API-Client. Routet basierend auf Prefix:
// - /auth/* und /einstellungen/* -> Pi-Backend (Cookie-Auth)
// - alles andere -> Mock-Backend
//
// Wenn Backend offline (Status 0):
// - Wenn der User KEINE Backend-URL gespeichert hat (Demo-Modus): still auf Mock fallback.
// - Wenn der User EINE URL gespeichert hat: ApiError "backend-offline" hochwerfen,
//   damit die UI den Offline-Zustand anzeigen kann statt klammheimlich Mock-Daten zu nehmen.

import { mockBackend } from "@/lib/mock/backend";
import { piApi, PiApiError } from "@/lib/api/piClient";
import { isBackendUrlExplicit } from "@/lib/api/backendUrl";

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

const PI_PREFIXES = [
  "/auth/",
  "/einstellungen/",
  "/backup/",
  // Step 3
  "/kunden/",
  "/ansprechpartner/",
  "/objekte/",
  "/notizen/",
  "/search/",
  // Step 4
  "/angebote/",
  "/rechnungen/",
  // Step 6
  "/email/",
  "/drive/",
  // Step 7
  "/aktivitaeten",
  "/benachrichtigungen",
  "/audit",
  "/events/",
  // Step 8
  "/system/",
  // Step 10
  "/steuern/",
  // Step 12
  "/dokumente",
  "/upload-sessions",
];
// Ausnahmen: /einstellungen/* die noch nicht im Pi-Backend leben → Mock
const MOCK_OVERRIDE_PREFIXES = [
  "/einstellungen/vorlagen",
];

function isPiPath(p: string): boolean {
  if (MOCK_OVERRIDE_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`))) return false;
  // Exakt-Match auf "/search" oder "/kunden" etc., oder startsWith "/search/"
  return PI_PREFIXES.some((pref) => {
    const bare = pref.endsWith("/") ? pref.slice(0, -1) : pref;
    if (p === bare) return true;
    return p.startsWith(pref.endsWith("/") ? pref : `${pref}/`) || p.startsWith(`${bare}?`);
  });
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
        return await piApi.put<T>(path, body);
      case "DELETE":
        return await piApi.delete<T>(path);
      default:
        throw new Error(`Methode nicht unterstützt: ${method}`);
    }
  } catch (err) {
    if (err instanceof PiApiError) {
      if (err.status === 0) {
        // Nur stiller Fallback wenn KEINE Backend-URL konfiguriert ist
        if (!isBackendUrlExplicit() && USE_MOCK) {
          return mockBackend<T>(method, path, body);
        }
        throw new ApiError("Backend offline", 0, err.body);
      }
      throw new ApiError(err.message, err.status, err.body);
    }
    throw err;
  }
}

function viaMockOrPi<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (isPiPath(path)) return viaPi<T>(method, path, body);
  return USE_MOCK ? mockBackend<T>(method, path, body) : viaPi<T>(method, path, body);
}

export const api = {
  isMock: USE_MOCK,
  get: <T>(path: string) => viaMockOrPi<T>("GET", path),
  post: <T>(path: string, body?: unknown) => viaMockOrPi<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => viaMockOrPi<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => viaMockOrPi<T>("PUT", path, body),
  delete: <T>(path: string) => viaMockOrPi<T>("DELETE", path),
};
