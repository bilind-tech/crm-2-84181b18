// Live-PDF-Vorschau für Protokolle. ArrayBuffer-Quelle für PDF.js
// (wie LivePdfPreview bei Angebot/Rechnung) — vermeidet
// "Unexpected server response (0)" beim Worker-Fetch der blob:-URL
// auf dem Pi-Backend.

import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { configurePdfWorker } from "@/lib/pdf/pdfjsWorker";

configurePdfWorker();
import { Loader2 } from "lucide-react";
import { generateProtokollPdf } from "@/lib/pdf/werkzeugePdf";
import type { Protokoll, Kunde, Objekt, Firmendaten } from "@/lib/api/types";

const DEBOUNCE_MS = 350;
const LOADER_DELAY_MS = 250;

const VOLATILE = new Set(["aktualisiertAm", "erstelltAm", "updatedAt", "createdAt"]);
function semKey<T>(o: T) {
  return JSON.stringify(o, (k, v) => (VOLATILE.has(k) ? undefined : v));
}

interface Props {
  draft: Protokoll;
  kunde?: Kunde;
  objekt?: Objekt;
  firma?: Firmendaten;
}

export function ProtokollLivePreview({ draft, kunde, objekt, firma }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pendingBuffer, setPendingBuffer] = useState<ArrayBuffer | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  const [loadAttempt, setLoadAttempt] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const fb = setTimeout(() => setContainerWidth((w) => (w === 0 ? 600 : w)), 1000);
    return () => {
      ro.disconnect();
      clearTimeout(fb);
    };
  }, []);

  useEffect(() => {
    if (!rendering) {
      setShowLoader(false);
      return;
    }
    const t = setTimeout(() => setShowLoader(true), LOADER_DELAY_MS);
    return () => clearTimeout(t);
  }, [rendering]);

  const draftKey = useMemo(() => semKey(draft), [draft]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setRendering(true);
      setBuildError(null);
      try {
        const blob = await generateProtokollPdf(draft, kunde, objekt, firma);
        if (cancelled) return;
        if (!(blob instanceof Blob) || blob.size === 0) {
          throw new Error("PDF konnte nicht erzeugt werden (leerer Blob).");
        }
        const buf = await blob.arrayBuffer();
        if (cancelled) return;
        const newUrl = URL.createObjectURL(blob);
        setPendingBuffer(buf);
        setPendingUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return newUrl;
        });
        setViewerError(null);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[ProtokollLivePreview] build failed", e);
        if (!cancelled) setBuildError(e instanceof Error ? e.message : "PDF-Fehler");
      } finally {
        if (!cancelled) setRendering(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, kunde, objekt, firma]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderWidth = useMemo(
    () => Math.min(Math.max(containerWidth - 16, 280), 900),
    [containerWidth],
  );

  // Frische Kopie pro Load — PDF.js detacht den Buffer im Worker.
  const fileSource = useMemo(
    () => (pdfBuffer ? { data: new Uint8Array(pdfBuffer.slice(0)) } : null),
    [pdfBuffer, loadAttempt],
  );
  const pendingFileSource = useMemo(
    () => (pendingBuffer ? { data: new Uint8Array(pendingBuffer.slice(0)) } : null),
    [pendingBuffer],
  );

  return (
    <div ref={containerRef} className="relative h-full overflow-y-auto bg-muted/30 px-2 py-3 sm:px-4">
      {showLoader && rendering && (
        <div className="pointer-events-none sticky top-2 z-20 ml-auto flex w-fit items-center gap-1.5 rounded-full bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm ring-1 ring-border backdrop-blur">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          aktualisiert …
        </div>
      )}

      {!pdfBuffer && !buildError && containerWidth > 0 && (
        <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>PDF wird erzeugt …</span>
        </div>
      )}

      {buildError && !pdfBuffer && (
        <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 px-6 text-center text-sm">
          <p className="font-medium text-destructive">PDF konnte nicht erzeugt werden</p>
          <p className="text-xs text-muted-foreground">{buildError}</p>
        </div>
      )}

      {buildError && pdfBuffer && (
        <div className="sticky top-2 z-20 mx-auto mb-2 w-fit max-w-[90%] rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1 text-xs text-destructive">
          Vorschau veraltet — letzter Build fehlgeschlagen: {buildError}
        </div>
      )}

      {fileSource && containerWidth > 0 && !viewerError && (
        <Document
          key={`buf#${pdfBuffer?.byteLength}#${loadAttempt}`}
          file={fileSource}
          onLoadSuccess={({ numPages }) => {
            setNumPages(numPages);
            setViewerError(null);
          }}
          onLoadError={(err) => {
            // eslint-disable-next-line no-console
            console.error("[ProtokollLivePreview] viewer error", err);
            const msg = err?.message || String(err);
            if (loadAttempt < 1 && pdfBuffer && /detached|already detached|neutered/i.test(msg)) {
              setLoadAttempt((n) => n + 1);
              return;
            }
            setViewerError(msg);
          }}
          loading={null}
          error={<div className="text-sm text-destructive">PDF kann nicht angezeigt werden.</div>}
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

      {/* Pre-Loader: atomarer Swap erst, wenn neue PDF erfolgreich geladen ist. */}
      {pendingFileSource && pendingBuffer !== pdfBuffer && (
        <div className="pointer-events-none absolute -z-10 h-0 w-0 overflow-hidden opacity-0">
          <Document
            key={`pending#${pendingBuffer?.byteLength}`}
            file={pendingFileSource}
            onLoadSuccess={({ numPages }) => {
              setNumPages(numPages);
              setPdfBuffer(pendingBuffer);
              setLoadAttempt(0);
              setPdfUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return pendingUrl;
              });
              setPendingBuffer(null);
              setPendingUrl(null);
            }}
            onLoadError={() => {
              if (pendingUrl) URL.revokeObjectURL(pendingUrl);
              setPendingBuffer(null);
              setPendingUrl(null);
            }}
            loading={null}
          >
            <Page pageNumber={1} width={1} renderAnnotationLayer={false} renderTextLayer={false} />
          </Document>
        </div>
      )}

      {viewerError && pdfBuffer && (
        <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 px-6 text-center text-sm">
          <p className="font-medium text-destructive">PDF kann nicht angezeigt werden</p>
          <p className="text-xs text-muted-foreground">{viewerError}</p>
          {pdfUrl && (
            <a href={pdfUrl} download className="mt-2 text-xs text-primary underline">
              PDF trotzdem herunterladen
            </a>
          )}
        </div>
      )}
    </div>
  );
}