// Lädt eine Dokument-Datei vom Backend in eine Blob-URL und räumt sie wieder auf.
import { useEffect, useState } from "react";
import { fetchDokumentBlobUrl } from "@/lib/dokument/upload";
import type { Dokument } from "@/lib/api/types";

export function useDokumentBlobUrl(dokument: Pick<Dokument, "id" | "url"> | null | undefined): {
  url: string;
  loading: boolean;
  error: string | null;
} {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dokument?.url) {
      setUrl("");
      return;
    }
    // Schon eine direkt-nutzbare URL (data:/blob:/http) → ohne fetch
    if (
      dokument.url.startsWith("data:") ||
      dokument.url.startsWith("blob:") ||
      dokument.url.startsWith("http")
    ) {
      setUrl(dokument.url);
      return;
    }
    let revoke: string | null = null;
    setLoading(true);
    setError(null);
    fetchDokumentBlobUrl(dokument)
      .then((u) => {
        revoke = u;
        setUrl(u);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Fehler"))
      .finally(() => setLoading(false));
    return () => {
      if (revoke && revoke.startsWith("blob:")) URL.revokeObjectURL(revoke);
    };
  }, [dokument?.id, dokument?.url]);

  return { url, loading, error };
}
