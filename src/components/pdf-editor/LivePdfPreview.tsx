// Live-PDF-Vorschau für den Editor: rendert pdfmake-PDF aus dem Draft,
// debounced bei Änderungen, zeigt alle Seiten untereinander, mit klickbaren
// Hotspots pro Seite (Pixel-genau aus dem pdfmake-Layout-Tracker).

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { configurePdfWorker } from "@/lib/pdf/pdfjsWorker";

configurePdfWorker();
import { Loader2 } from "lucide-react";
import { generateAngebotPdf, generateRechnungPdf } from "@/lib/pdf/belegPdf";
import type { Angebot, Rechnung, Kunde, Firmendaten, Ansprechpartner } from "@/lib/api/types";
import { PdfFieldOverlay } from "./PdfFieldOverlay";
import { A4 } from "@/lib/pdf/hotspotTracker";
import type { RuntimeHotspot } from "@/lib/pdf/hotspotTracker";
import { FALLBACK_HOTSPOTS_SEITE_1 } from "@/lib/pdf/fieldMap";

interface CommonProps {
  kunde: Kunde;
  firma: Firmendaten;
  ansprechpartner?: Ansprechpartner;
  /** Inline-Editor pro Hotspot (Render-Prop). */
  renderEditor: (fieldId: string, close: () => void) => React.ReactNode;
}

type Props =
  | ({ kind: "angebot"; draft: Angebot } & CommonProps)
  | ({ kind: "rechnung"; draft: Rechnung } & CommonProps);

const DEBOUNCE_MS = 450;
const LOADER_DELAY_MS = 250;

// Volatile Server-Felder aus Build-Trigger ausschließen, damit Server-Echos
// (Timestamps) keinen erneuten PDF-Build auslösen.
const VOLATILE_KEYS = new Set(["aktualisiertAm", "updatedAt", "erstelltAm", "createdAt"]);
function semanticKey<T>(obj: T): string {
  return JSON.stringify(obj, (k, v) => (VOLATILE_KEYS.has(k) ? undefined : v));
}

export function LivePdfPreview(props: Props) {
  const { draft, kunde, firma, ansprechpartner, renderEditor, kind } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  // Originaldaten als ArrayBuffer halten, NIE direkt an PDF.js geben.
  // Pro Document-Load wird eine frische Kopie via slice(0) erzeugt,
  // sonst: "ArrayBuffer at index 0 is already detached" beim Re-Render.
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [hotspots, setHotspots] = useState<RuntimeHotspot[]>([]);
  const [numPages, setNumPages] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [openHotspotId, setOpenHotspotId] = useState<string | null>(null);

  // Container-Breite messen
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const fallback = setTimeout(() => {
      setContainerWidth((w) => (w === 0 ? 600 : w));
    }, 1000);
    return () => {
      ro.disconnect();
      clearTimeout(fallback);
    };
  }, []);

  // Build-Trigger nur bei semantischer Änderung des Drafts (Timestamps egal).
  const draftKey = useMemo(() => semanticKey(draft), [draft]);
  const ctxKey = useMemo(
    () => semanticKey({ kunde, firma, ansprechpartner, kind }),
    [kunde, firma, ansprechpartner, kind],
  );
  const inFlightRef = useRef(false);

  // Loader-Pille erst nach LOADER_DELAY_MS einblenden (kein Aufblitzen).
  useEffect(() => {
    if (!rendering) {
      setShowLoader(false);
      return;
    }
    const t = setTimeout(() => setShowLoader(true), LOADER_DELAY_MS);
    return () => clearTimeout(t);
  }, [rendering]);

  // Pending: erst tauschen, wenn neue PDF erfolgreich geladen ist (atomarer Swap → kein Flackern).
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [pendingBuffer, setPendingBuffer] = useState<ArrayBuffer | null>(null);

  // Debounced PDF-Build — alte URL bleibt bis neue geladen ist (kein Flicker).
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setRendering(true);
      setBuildError(null);
      try {
        const result =
          kind === "angebot"
            ? await generateAngebotPdf(draft as Angebot, kunde, firma, ansprechpartner)
            : await generateRechnungPdf(draft as Rechnung, kunde, firma, ansprechpartner);
        if (cancelled) return;
        if (!(result.blob instanceof Blob) || result.blob.size === 0) {
          throw new Error("PDF konnte nicht erzeugt werden (leerer Blob).");
        }
        const buf = await result.blob.arrayBuffer();
        if (cancelled) return;
        const newUrl = URL.createObjectURL(result.blob);
        if (!pdfBuffer) {
          // Erster Build → direkt anzeigen, keinen Pending-Umweg.
          setHotspots(result.hotspots);
          setPdfBuffer(buf);
          setPdfUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return newUrl;
          });
        } else {
          setHotspots(result.hotspots);
          setPendingBuffer(buf);
          setPendingUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return newUrl;
          });
        }
        setViewerError(null);
      } catch (e) {
        console.error(e);
        if (!cancelled)
          setBuildError(e instanceof Error ? e.message : "PDF konnte nicht erzeugt werden.");
      } finally {
        inFlightRef.current = false;
        if (!cancelled) setRendering(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, ctxKey]);

  // URL-Cleanup bei Unmount
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderWidthRaw = useMemo(() => {
    const raw = Math.min(Math.max(containerWidth - 16, 280), 900);
    return Math.round(raw / 20) * 20;
  }, [containerWidth]);
  const renderWidth = useDeferredValue(renderWidthRaw);
  const scale = renderWidth / A4.width;

  // Frische Kopie pro Render — sonst detacht PDF.js-Worker den Buffer.
  const fileSource = useMemo(
    () => (pdfBuffer ? { data: new Uint8Array(pdfBuffer.slice(0)) } : null),
    [pdfBuffer, loadAttempt],
  );
  const pendingFileSource = useMemo(
    () => (pendingBuffer ? { data: new Uint8Array(pendingBuffer.slice(0)) } : null),
    [pendingBuffer],
  );

  // Falls Tracker-Treffer leer (z.B. Rendering-Glitch), nutze Fallback (Seite 1).
  const effectiveHotspots: RuntimeHotspot[] = useMemo(() => {
    if (hotspots.length > 0) return hotspots;
    return FALLBACK_HOTSPOTS_SEITE_1.map((f) => ({
      id: f.id,
      page: f.page,
      x: f.box.x * A4.width,
      y: f.box.y * A4.height,
      w: f.box.w * A4.width,
      h: f.box.h * A4.height,
    }));
  }, [hotspots]);

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-y-auto bg-muted/30 px-2 py-3 sm:px-4"
    >
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
          key={`pdf-${loadAttempt}`}
          file={fileSource}
          onLoadSuccess={({ numPages }) => {
            setNumPages(numPages);
            setViewerError(null);
          }}
          onLoadError={(err) => {
            console.error("[LivePdfPreview] Document load error", err);
            const msg = err?.message || String(err);
            if (
              loadAttempt < 1 &&
              pdfBuffer &&
              /detached|already detached|neutered/i.test(msg)
            ) {
              setLoadAttempt((n) => n + 1);
              return;
            }
            setViewerError(msg);
          }}
          loading={null}
          error={<div className="text-sm text-destructive">PDF kann nicht angezeigt werden.</div>}
          className="flex flex-col items-center gap-4"
        >
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => {
            const pageHotspots = effectiveHotspots.filter((h) => h.page === pageNum);
            return (
              <div
                key={pageNum}
                className="relative overflow-hidden rounded-md bg-background shadow-sm ring-1 ring-border"
              >
                <Page
                  pageNumber={pageNum}
                  width={renderWidth}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                />
                <PdfFieldOverlay
                  hotspots={pageHotspots}
                  scale={scale}
                  openId={openHotspotId}
                  onOpenChange={setOpenHotspotId}
                  renderEditor={renderEditor}
                />
              </div>
            );
          })}
        </Document>
      )}

      {/* Hidden pre-loader: lädt die nächste PDF im Hintergrund und tauscht atomar. */}
      {pendingFileSource && pendingBuffer !== pdfBuffer && (
        <div className="pointer-events-none absolute -z-10 h-0 w-0 overflow-hidden opacity-0">
          <Document
            key={`pending#${pendingBuffer?.byteLength}`}
            file={pendingFileSource}
            onLoadSuccess={() => {
              // numPages erst nach dem Swap aus dem sichtbaren Document setzen.
              setPdfBuffer(pendingBuffer);
              setLoadAttempt(0);
              setPdfUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return pendingUrl;
              });
              setPendingUrl(null);
              setPendingBuffer(null);
            }}
            onLoadError={() => {
              if (pendingUrl) URL.revokeObjectURL(pendingUrl);
              setPendingUrl(null);
              setPendingBuffer(null);
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
            <a href={pdfUrl} download className="mt-2 text-xs underline text-primary">
              PDF trotzdem herunterladen
            </a>
          )}
        </div>
      )}
    </div>
  );
}
