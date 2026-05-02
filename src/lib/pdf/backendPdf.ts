// Lädt PDFs vom Pi-Backend (Step 5).
// Liefert null, wenn kein explizites Backend konfiguriert ist (Demo/Mock-Modus)
// oder das Backend offline/nicht antwortet — Caller fällt dann auf Browser-Generator zurück.

import { getBackendUrl, isBackendUrlExplicit } from "@/lib/api/backendUrl";

export type BelegArt = "angebot" | "rechnung";

export interface BackendPdfResult {
  blob: Blob;
  dateiname: string;
  hash: string;
  fromCache: boolean;
}

function parseDateiname(headers: Headers, fallback: string): string {
  const cd = headers.get("content-disposition") ?? "";
  // filename*=UTF-8''... oder filename="..."
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) {
    try { return decodeURIComponent(star[1]); } catch { /* noop */ }
  }
  const plain = /filename="?([^"]+)"?/i.exec(cd);
  return plain ? plain[1] : fallback;
}

export async function fetchBackendPdf(
  art: BelegArt,
  id: string,
  signal?: AbortSignal,
): Promise<BackendPdfResult | null> {
  if (!isBackendUrlExplicit()) return null;
  const base = getBackendUrl();
  const route = art === "angebot" ? "angebote" : "rechnungen";
  let res: Response;
  try {
    res = await fetch(`${base}/${route}/${encodeURIComponent(id)}/pdf`, {
      credentials: "include",
      signal,
    });
  } catch {
    return null; // Backend offline → Fallback
  }
  if (!res.ok) return null;
  const blob = await res.blob();
  const etag = (res.headers.get("etag") ?? "").replace(/^"|"$/g, "");
  const fromCache = res.headers.get("x-pdf-cache") === "hit";
  return {
    blob,
    dateiname: parseDateiname(res.headers, `${art}-${id}.pdf`),
    hash: etag,
    fromCache,
  };
}
