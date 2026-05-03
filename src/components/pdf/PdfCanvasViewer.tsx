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
import { Loader2, AlertCircle, Download, ExternalLink } from "lucide-react";

configurePdfWorker();

interface Props {
  /** Blob-URL (oder data:-URL) der anzuzeigenden PDF. */
  pdfUrl: string | null;
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
  fileName,
  maxWidth = 900,
  className,
  firstPageOnly = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

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
  }, [pdfUrl]);

  const renderWidth = useMemo(
    () => Math.min(Math.max(containerWidth - 16, 280), maxWidth),
    [containerWidth, maxWidth],
  );

  const pages = useMemo(() => {
    if (numPages <= 0) return [];
    if (firstPageOnly) return [1];
    return Array.from({ length: numPages }, (_, i) => i + 1);
  }, [numPages, firstPageOnly]);

  return (
    <div ref={containerRef} className={className ?? "h-full w-full overflow-y-auto bg-muted/30"}>
      {!pdfUrl && (
        <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>PDF wird erzeugt …</span>
        </div>
      )}

      {pdfUrl && loadError && (
        <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <div className="text-sm font-medium text-destructive">PDF kann nicht angezeigt werden</div>
          <p className="max-w-md text-xs text-muted-foreground">{loadError}</p>
          <div className="flex gap-2">
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
          </div>
        </div>
      )}

      {pdfUrl && !loadError && containerWidth > 0 && (
        <Document
          file={pdfUrl}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          onLoadError={(err) => {
            // eslint-disable-next-line no-console
            console.error("[PdfCanvasViewer] load error", err);
            setLoadError(err?.message || String(err));
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
