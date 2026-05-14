// Live-PDF-Vorschau für Protokolle. Debounced Build aus dem Draft, atomarer URL-Swap.

import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { configurePdfWorker } from "@/lib/pdf/pdfjsWorker";

configurePdfWorker();
import { Loader2 } from "lucide-react";
import { generateProtokollPdf } from "@/lib/pdf/werkzeugePdf";
import type { Protokoll, Kunde, Objekt, Firmendaten } from "@/lib/api/types";

const A4_WIDTH = 595.28;
const DEBOUNCE = 350;

interface Props {
  draft: Protokoll;
  kunde?: Kunde;
  objekt?: Objekt;
  firma?: Firmendaten;
}

const VOLATILE = new Set(["aktualisiertAm", "erstelltAm"]);
function semKey<T>(o: T) {
  return JSON.stringify(o, (k, v) => (VOLATILE.has(k) ? undefined : v));
}

export function ProtokollLivePreview({ draft, kunde, objekt, firma }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!rendering) {
      setShowLoader(false);
      return;
    }
    const t = setTimeout(() => setShowLoader(true), 300);
    return () => clearTimeout(t);
  }, [rendering]);

  const draftKey = useMemo(() => semKey(draft), [draft]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setRendering(true);
      setError(null);
      try {
        const blob = await generateProtokollPdf(draft, kunde, objekt, firma);
        if (cancelled) return;
        if (!(blob instanceof Blob) || blob.size === 0) {
          throw new Error("PDF konnte nicht erzeugt werden (leerer Blob).");
        }
        const url = URL.createObjectURL(blob);
        setPendingUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : "PDF-Fehler");
      } finally {
        if (!cancelled) setRendering(false);
      }
    }, DEBOUNCE);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, kunde, objekt, firma]);

  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  );

  const renderWidth = Math.min(Math.max(width - 16, 280), 900);

  return (
    <div ref={ref} className="relative h-full overflow-y-auto bg-muted/30 px-2 py-3 sm:px-4">
      {showLoader && rendering && (
        <div className="pointer-events-none sticky top-2 z-20 ml-auto flex w-fit items-center gap-1.5 rounded-full bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm ring-1 ring-border backdrop-blur">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          aktualisiert …
        </div>
      )}
      {!pdfUrl && !error && width > 0 && (
        <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>PDF wird erzeugt …</span>
        </div>
      )}
      {error && !pdfUrl && (
        <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 px-6 text-center text-sm">
          <p className="font-medium text-destructive">PDF konnte nicht erzeugt werden</p>
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      )}
      {pdfUrl && width > 0 && (
        <Document
          file={pdfUrl}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={null}
          className="flex flex-col items-center gap-4"
        >
          {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
            <div
              key={n}
              className="relative overflow-hidden rounded-md bg-background shadow-sm ring-1 ring-border"
            >
              <Page
                pageNumber={n}
                width={renderWidth}
                renderAnnotationLayer={false}
                renderTextLayer={false}
              />
            </div>
          ))}
        </Document>
      )}
      {pendingUrl && pendingUrl !== pdfUrl && (
        <div className="pointer-events-none absolute -z-10 h-0 w-0 overflow-hidden opacity-0">
          <Document
            file={pendingUrl}
            onLoadSuccess={() => {
              setPdfUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return pendingUrl;
              });
              setPendingUrl(null);
            }}
            onLoadError={() => {
              if (pendingUrl) URL.revokeObjectURL(pendingUrl);
              setPendingUrl(null);
            }}
            loading={null}
          >
            <Page pageNumber={1} width={1} renderAnnotationLayer={false} renderTextLayer={false} />
          </Document>
        </div>
      )}
    </div>
  );
}
// A4 unused but kept for parity
export const _A4 = A4_WIDTH;
