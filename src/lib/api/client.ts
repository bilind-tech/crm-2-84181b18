// API-Client: routet alles ans Pi-Backend.
// Keine Mock-/Demo-Fallbacks mehr — die App ist Produktions-ready.
import { piApi, PiApiError } from "@/lib/api/piClient";

export class ApiError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
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
      if (err.status === 0) throw new ApiError("Backend offline", 0, err.body);
      throw new ApiError(err.message, err.status, err.body);
    }
    throw err;
  }
}

export const api = {
  get: <T>(path: string) => viaPi<T>("GET", path),
  post: <T>(path: string, body?: unknown) => viaPi<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => viaPi<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => viaPi<T>("PUT", path, body),
  delete: <T>(path: string) => viaPi<T>("DELETE", path),
};
