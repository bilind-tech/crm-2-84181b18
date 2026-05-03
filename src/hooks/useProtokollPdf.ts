// Erzeugt eine Blob-URL für die PDF eines Protokolls (Live aus den Daten)
// und räumt sie beim Unmount/Refresh sauber wieder auf.
import { useEffect, useState } from "react";
import { generateProtokollPdf } from "@/lib/pdf/werkzeugePdf";
import type { Firmendaten, Kunde, Objekt, Protokoll } from "@/lib/api/types";

export type ProtokollPdfStatus = "idle" | "loading" | "ready" | "error";

const VOLATILE = new Set(["aktualisiertAm", "erstelltAm"]);
const stable = <T,>(o: T) => JSON.stringify(o, (k, v) => (VOLATILE.has(k) ? undefined : v));

export function useProtokollPdf(
  protokoll: Protokoll | undefined,
  kunde: Kunde | undefined,
  objekt: Objekt | undefined,
  firma: Firmendaten | undefined,
): { url: string | null; status: ProtokollPdfStatus; error: string | null; blob: Blob | null } {
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [status, setStatus] = useState<ProtokollPdfStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const key = protokoll ? stable(protokoll) : "";

  useEffect(() => {
    if (!protokoll) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    setStatus("loading");
    setError(null);
    (async () => {
      try {
        const b = await generateProtokollPdf(protokoll, kunde, objekt, firma);
        if (cancelled) return;
        createdUrl = URL.createObjectURL(b);
        setBlob(b);
        setUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return createdUrl;
        });
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "PDF-Fehler");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, kunde, objekt, firma]);

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { url, status, error, blob };
}
