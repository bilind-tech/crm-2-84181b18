import { useEffect, useState } from "react";
import { useKunde, useFirmendaten } from "@/hooks/useApi";
import { generateAngebotPdf, generateRechnungPdf } from "@/lib/pdf/belegPdf";
import { fetchBackendPdf } from "@/lib/pdf/backendPdf";
import type { Angebot, Rechnung } from "@/lib/api/types";

type Status = "idle" | "loading" | "ready" | "error";

const PDF_TIMEOUT_MS = 20_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} hat zu lange gedauert (>${Math.round(ms / 1000)}s).`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function useAngebotPdf(angebot?: Angebot) {
  const { data: kunde } = useKunde(angebot?.kundeId ?? "");
  const { data: firma } = useFirmendaten();
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!angebot || !kunde || !firma) return;
    let blobUrl: string | null = null;
    let cancelled = false;
    const ctrl = new AbortController();
    setStatus("loading");
    setError(null);

    (async () => {
      try {
        const backend = await fetchBackendPdf("angebot", angebot.id, ctrl.signal);
        if (cancelled) return;
        if (backend) {
          blobUrl = URL.createObjectURL(backend.blob);
          setUrl(blobUrl);
          setStatus("ready");
          return;
        }
        const { blob } = await withTimeout(
          generateAngebotPdf(angebot, kunde, firma),
          PDF_TIMEOUT_MS,
          "PDF-Erzeugung",
        );
        if (cancelled) return;
        blobUrl = URL.createObjectURL(blob);
        setUrl(blobUrl);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        console.error("[useAngebotPdf]", e);
        setError(String((e as Error)?.message ?? e));
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [angebot, kunde, firma]);

  return { url, status, error };
}

export function useRechnungPdf(rechnung?: Rechnung) {
  const { data: kunde } = useKunde(rechnung?.kundeId ?? "");
  const { data: firma } = useFirmendaten();
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rechnung || !kunde || !firma) return;
    let blobUrl: string | null = null;
    let cancelled = false;
    const ctrl = new AbortController();
    setStatus("loading");
    setError(null);

    (async () => {
      try {
        const backend = await fetchBackendPdf("rechnung", rechnung.id, ctrl.signal);
        if (cancelled) return;
        if (backend) {
          blobUrl = URL.createObjectURL(backend.blob);
          setUrl(blobUrl);
          setStatus("ready");
          return;
        }
        const { blob } = await withTimeout(
          generateRechnungPdf(rechnung, kunde, firma),
          PDF_TIMEOUT_MS,
          "PDF-Erzeugung",
        );
        if (cancelled) return;
        blobUrl = URL.createObjectURL(blob);
        setUrl(blobUrl);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        console.error("[useRechnungPdf]", e);
        setError(String((e as Error)?.message ?? e));
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [rechnung, kunde, firma]);

  return { url, status, error };
}
