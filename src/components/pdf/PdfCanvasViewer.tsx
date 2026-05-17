// Robuster PDF-Viewer auf Basis von react-pdf/PDF.js (Canvas-Rendering).
// Wird sowohl im PdfViewerDialog (Auge-Icon) als auch in der PdfPreviewCard
// (Inline-Vorschau auf Detailseiten) verwendet.
//
// Wichtig: Wir rendern KEIN natives <object>/<iframe> mehr, weil die
// Lovable-Preview (und manche Browser ohne PDF-Plugin) sonst eine leere
// weiße Fläche zeigen. Stattdessen rendern wir die Seiten als Canvas und
// bieten klare Fallbacks (Öffnen/Download), falls PDF.js fehlschlägt.

import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { configurePdfWorker } from "@/lib/pdf/pdfjsWorker";
import { Loader2, AlertCircle, Download, ExternalLink, RefreshCw } from "lucide-react";

configurePdfWorker();

interface Props {
  /** Blob-URL (oder data:-URL) der anzuzeigenden PDF. */
  pdfUrl: string | null;
  /** Bevorzugte Quelle für PDF.js: Blob direkt (umgeht instabile blob:-URLs). */
  pdfBlob?: Blob | null;
  /** Datei­name für Download-Fallback. */
  fileName: string;
  /** Maximale Breite einer Seite in Pixeln. */
  maxWidth?: number;
  /** Container-Klasse — bestimmt Höhe/Hintergrund. */
  className?: string;
  /** Wenn true: nur Seite 1 rendern (kompakte Inline-Vorschau). */
  firstPageOnly?: boolean;
}

export function PdfCanvasViewer({
  pdfUrl,
  pdfBlob,
  fileName,
  maxWidth = 900,
  className,
  firstPageOnly = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // ORIGINAL-Buffer im State halten und NIE direkt an PDF.js geben.
  // PDF.js transferiert ArrayBuffer in den Worker (postMessage) und detacht
  // dabei den Buffer. Würden wir denselben Buffer beim Re-Mount wieder
  // übergeben, käme: "ArrayBuffer at index 0 is already detached".
  // Lösung: pro Document-Load eine frische Kopie via `slice(0)` erzeugen.
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!pdfBlob) {
      setPdfBuffer(null);
      return;
    }
    pdfBlob
      .arrayBuffer()
      .then((buf) => {
        if (!cancelled) setPdfBuffer(buf);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[PdfCanvasViewer] blob→arrayBuffer failed", err);
        if (!cancelled) setPdfBuffer(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pdfBlob]);

  // Container-Breite messen, mit Fallback falls ResizeObserver nicht feuert.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setContainerWidth(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const fb = setTimeout(() => {
      setContainerWidth((w) => (w === 0 ? 600 : w));
    }, 800);
    return () => {
      ro.disconnect();
      clearTimeout(fb);
    };
  }, []);

  // Wechsel der PDF → Fehler/Seitenanzahl zurücksetzen.
  useEffect(() => {
    setLoadError(null);
    setNumPages(0);
    setAttempt(0);
  }, [pdfUrl, pdfBlob]);

  const renderWidth = useMemo(
    () => Math.min(Math.max(containerWidth - 16, 280), maxWidth),
    [containerWidth, maxWidth],
  );

  const pages = useMemo(() => {
    if (numPages <= 0) return [];
    if (firstPageOnly) return [1];
    return Array.from({ length: numPages }, (_, i) => i + 1);
  }, [numPages, firstPageOnly]);

  // Frische Kopie des Buffers für JEDEN PDF.js-Load. `slice(0)` erzeugt
  // einen neuen ArrayBuffer, der Original-Buffer bleibt intakt und kann
  // beim nächsten Mount/Retry erneut kopiert werden.
  const fileSource = useMemo(() => {
    if (pdfBuffer) {
      try {
        return { data: new Uint8Array(pdfBuffer.slice(0)) };
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[PdfCanvasViewer] buffer.slice failed", err);
        return pdfUrl ?? null;
      }
    }
    return pdfUrl ?? null;
    // attempt erzwingt eine frische Kopie bei Retry.
  }, [pdfBuffer, pdfUrl, attempt]);

  const hasSource = !!pdfBuffer || !!pdfUrl;
  const sourceKey = pdfBuffer ? `buf#${pdfBuffer.byteLength}` : (pdfUrl ?? "none");
  const sourceMode: "buffer" | "url" | "none" = pdfBuffer
    ? "buffer"
    : pdfUrl
      ? "url"
      : "none";
  const sourceLabel =
    sourceMode === "buffer"
      ? `ArrayBuffer · ${Math.round((pdfBuffer?.byteLength ?? 0) / 1024)} KB`
      : sourceMode === "url"
        ? `${pdfUrl?.startsWith("blob:") ? "blob-URL" : pdfUrl?.startsWith("data:") ? "data-URL" : "HTTP-URL"}`
        : "—";

  return (
    <div ref={containerRef} className={className ?? "h-full w-full overflow-y-auto bg-muted/30"}>
      {!hasSource && (
        <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>PDF wird erstellt …</span>
        </div>
      )}

      {hasSource && loadError && (
        <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <div className="text-sm font-medium text-destructive">
            PDF kann nicht angezeigt werden
          </div>
          <p className="max-w-md text-xs text-muted-foreground">{loadError}</p>
          <p className="max-w-md text-[10px] font-mono text-muted-foreground/70">
            Quelle: {sourceLabel} · Versuch {attempt + 1}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setLoadError(null);
                setNumPages(0);
                setAttempt((n) => n + 1);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
            >
              <RefreshCw className="h-4 w-4" /> Erneut versuchen
            </button>
            {pdfUrl && (
              <>
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
                >
                  <ExternalLink className="h-4 w-4" /> In neuem Tab öffnen
                </a>
                <a
                  href={pdfUrl}
                  download={fileName}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  <Download className="h-4 w-4" /> Herunterladen
                </a>
              </>
            )}
          </div>
        </div>
      )}

      {fileSource && !loadError && containerWidth > 0 && (
        <Document
          key={`${sourceKey}#${attempt}`}
          file={fileSource}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          onLoadError={(err) => {
            // eslint-disable-next-line no-console
            console.error("[PdfCanvasViewer] load error", {
              message: err?.message,
              sourceMode,
              byteLength: pdfBuffer?.byteLength ?? 0,
              pdfUrl,
              attempt,
              fileName,
            });
            const msg = err?.message || String(err);
            // Auto-Retry bei detached-ArrayBuffer (StrictMode / Re-Mount).
            if (
              attempt < 1 &&
              pdfBuffer &&
              /detached|already detached|neutered/i.test(msg)
            ) {
              setAttempt((n) => n + 1);
              return;
            }
            setLoadError(msg);
          }}
          loading={
            <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>PDF wird geladen …</span>
            </div>
          }
          error={null}
          className="flex flex-col items-center gap-3 py-3"
        >
          {pages.map((pageNum) => (
            <div
              key={pageNum}
              className="overflow-hidden rounded-md bg-background shadow-sm ring-1 ring-border"
            >
              <Page
                pageNumber={pageNum}
                width={renderWidth}
                renderAnnotationLayer={false}
                renderTextLayer={false}
              />
            </div>
          ))}
        </Document>
      )}
    </div>
  );
}
