// PDF-Hook mit React-Query-Cache.
//
// - Pro Beleg-ID gibt es genau EINE Query (`["pdf", art, id]`).
// - `staleTime: Infinity` → solange App offen, kein automatisches Nachladen.
// - Beim ersten Öffnen wird die PDF einmal gebaut/geladen, danach kommt sie
//   bei jedem Re-Mount sofort aus dem Cache (kein Loader-Flackern).
// - Editor-Save invalidiert die Query → einmaliger Reload mit neuer Version.
//
// Backend-Modus (Pi): Server liefert die PDF aus seinem Disk-Cache (ETag,
//   `X-Pdf-Cache: hit/miss`). Schreibt eine neue Datei, löscht atomar die alte
//   gleiche-ID-Datei.
// Mock-Modus (Lovable-Preview): pdfmake baut im Browser, Ergebnis liegt zusätzlich
//   in einer LRU-Map in `belegPdf.ts`.

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useKunde, useFirmendaten } from "@/hooks/useApi";
import { generateAngebotPdf, generateRechnungPdf } from "@/lib/pdf/belegPdf";
import { fetchBackendPdf } from "@/lib/pdf/backendPdf";
import type { Angebot, Rechnung, Kunde, Firmendaten } from "@/lib/api/types";

type Status = "idle" | "loading" | "ready" | "error";

const PDF_TIMEOUT_MS = 20_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} hat zu lange gedauert (>${Math.round(ms / 1000)}s).`)),
      ms,
    );
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export const pdfQueryKey = (art: "angebot" | "rechnung", id: string) => ["pdf", art, id] as const;

interface PdfData {
  blob: Blob;
  fileName?: string;
}

async function buildAngebot(angebot: Angebot, kunde: Kunde, firma: Firmendaten): Promise<PdfData> {
  const backend = await fetchBackendPdf("angebot", angebot.id);
  if (backend) return { blob: backend.blob, fileName: backend.dateiname };
  const { blob } = await withTimeout(generateAngebotPdf(angebot, kunde, firma), PDF_TIMEOUT_MS, "PDF-Erstellung");
  return { blob };
}

async function buildRechnung(rechnung: Rechnung, kunde: Kunde, firma: Firmendaten): Promise<PdfData> {
  const backend = await fetchBackendPdf("rechnung", rechnung.id);
  if (backend) return { blob: backend.blob, fileName: backend.dateiname };
  const { blob } = await withTimeout(generateRechnungPdf(rechnung, kunde, firma), PDF_TIMEOUT_MS, "PDF-Erstellung");
  return { blob };
}

/**
 * Erzeugt eine stabile Blob-URL pro Blob-Identität.
 *
 * Wichtig: In React 19 / StrictMode laufen Effekt-Cleanups doppelt. Würden wir
 * `URL.revokeObjectURL` direkt im Cleanup aufrufen, wäre die gerade an
 * react-pdf übergebene URL beim zweiten Mount bereits ungültig → Status 0
 * "Unexpected server response". Wir geben die alte URL deshalb nur frei, wenn
 * sich der Blob tatsächlich ändert, und verzögern das endgültige Revoke beim
 * Unmount minimal, damit ein direkter Re-Mount dieselbe URL weiter nutzen kann.
 */
function useBlobUrl(blob: Blob | undefined, cacheKey: string): string | null {
  const entryRef = useRef<{ blob: Blob; url: string; cacheKey: string } | null>(null);

  // Wechsel der Beleg-Identität → alte URL sofort freigeben, sonst zeigt
  // react-pdf u. U. noch die Vorgänger-PDF an oder läuft mit toter URL.
  if (entryRef.current && entryRef.current.cacheKey !== cacheKey) {
    URL.revokeObjectURL(entryRef.current.url);
    entryRef.current = null;
  }

  if (blob) {
    if (!entryRef.current || entryRef.current.blob !== blob) {
      if (entryRef.current) URL.revokeObjectURL(entryRef.current.url);
      entryRef.current = { blob, url: URL.createObjectURL(blob), cacheKey };
    }
  }

  useEffect(() => {
    return () => {
      const entry = entryRef.current;
      if (!entry) return;
      const url = entry.url;
      entryRef.current = null;
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  }, []);

  return entryRef.current?.url ?? null;
}

interface UsePdfResult {
  url: string | null;
  status: Status;
  error: string | null;
  fileName?: string;
}

export function useAngebotPdf(angebot?: Angebot): UsePdfResult {
  const { data: kunde } = useKunde(angebot?.kundeId ?? "");
  const { data: firma } = useFirmendaten();
  const enabled = !!angebot && !!kunde && !!firma;

  const query = useQuery({
    queryKey: angebot ? pdfQueryKey("angebot", angebot.id) : ["pdf", "angebot", "noop"],
    queryFn: () => buildAngebot(angebot!, kunde!, firma!),
    enabled,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const url = useBlobUrl(query.data?.blob, angebot?.id ?? "noop");
  const status: Status = !enabled ? "idle"
    : query.isError ? "error"
    : query.data ? "ready"
    : "loading";

  return {
    url,
    status,
    error: query.error ? String((query.error as Error)?.message ?? query.error) : null,
    fileName: query.data?.fileName,
  };
}

export function useRechnungPdf(rechnung?: Rechnung): UsePdfResult {
  const { data: kunde } = useKunde(rechnung?.kundeId ?? "");
  const { data: firma } = useFirmendaten();
  const enabled = !!rechnung && !!kunde && !!firma;

  const query = useQuery({
    queryKey: rechnung ? pdfQueryKey("rechnung", rechnung.id) : ["pdf", "rechnung", "noop"],
    queryFn: () => buildRechnung(rechnung!, kunde!, firma!),
    enabled,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const url = useBlobUrl(query.data?.blob, rechnung?.id ?? "noop");
  const status: Status = !enabled ? "idle"
    : query.isError ? "error"
    : query.data ? "ready"
    : "loading";

  return {
    url,
    status,
    error: query.error ? String((query.error as Error)?.message ?? query.error) : null,
    fileName: query.data?.fileName,
  };
}

/** Helper: PDF-Cache für eine Beleg-ID invalidieren (Editor-Save, SSE, manuell). */
export function useInvalidateBelegPdf() {
  const qc = useQueryClient();
  return (art: "angebot" | "rechnung", id: string) => {
    qc.invalidateQueries({ queryKey: pdfQueryKey(art, id) });
  };
}
