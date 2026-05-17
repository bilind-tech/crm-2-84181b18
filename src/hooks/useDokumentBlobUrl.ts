// Lädt eine Dokument-Datei vom Backend in eine Blob-URL und räumt sie wieder auf.
import { useEffect, useState } from "react";
import { fetchDokumentBlobUrl } from "@/lib/dokument/upload";
import type { Dokument } from "@/lib/api/types";

export function useDokumentBlobUrl(dokument: Pick<Dokument, "id" | "url"> | null | undefined): {
  url: string;
  blob: Blob | null;
  loading: boolean;
  error: string | null;
} {
  const [url, setUrl] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dokument?.url) {
      setUrl("");
      setBlob(null);
      return;
    }
    // Schon eine direkt-nutzbare URL (data:/blob:/http) → ohne fetch
    if (
      dokument.url.startsWith("data:") ||
      dokument.url.startsWith("blob:") ||
      dokument.url.startsWith("http")
    ) {
      setUrl(dokument.url);
      setBlob(null);
      return;
    }
    let revoke: string | null = null;
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Eigener Fetch (statt fetchDokumentBlobUrl) — wir brauchen den Blob
    // zusätzlich, um ihn an PDF.js als ArrayBuffer zu geben und damit den
    // „Unexpected server response (0)"-Fehler bei blob:-URLs zu vermeiden.
    (async () => {
      try {
        const { dokumentDateiUrl } = await import("@/lib/dokument/upload");
        const fileUrl = dokumentDateiUrl(dokument);
        const res = await fetch(fileUrl, { credentials: "include" });
        if (!res.ok) throw new Error(`Datei nicht ladbar (${res.status})`);
        const b = await res.blob();
        if (cancelled) return;
        const u = URL.createObjectURL(b);
        revoke = u;
        setBlob(b);
        setUrl(u);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Fehler");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (revoke && revoke.startsWith("blob:")) URL.revokeObjectURL(revoke);
    };
  }, [dokument?.id, dokument?.url]);

  return { url, blob, loading, error };
}
