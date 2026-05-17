// Live-PDF-Vorschau für Protokolle. ArrayBuffer-Quelle für PDF.js
// (wie LivePdfPreview bei Angebot/Rechnung) — vermeidet
// "Unexpected server response (0)" beim Worker-Fetch der blob:-URL
// auf dem Pi-Backend.

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { configurePdfWorker } from "@/lib/pdf/pdfjsWorker";

configurePdfWorker();
import { Loader2 } from "lucide-react";
import { generateProtokollPdf } from "@/lib/pdf/werkzeugePdf";
import type { Protokoll, Kunde, Objekt, Firmendaten } from "@/lib/api/types";
import { PdfFieldOverlay } from "@/components/pdf-editor/PdfFieldOverlay";
import { protokollMetaForId, FALLBACK_HOTSPOTS_PROTOKOLL_SEITE_1 } from "@/lib/pdf/fieldMap";
import { A4, type RuntimeHotspot } from "@/lib/pdf/hotspotTracker";

const DEBOUNCE_MS = 800;
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
  /** Inline-Editor pro Hotspot (Render-Prop, identisch zu LivePdfPreview). */
  renderEditor?: (fieldId: string, close: () => void) => React.ReactNode;
}

export function ProtokollLivePreview({ draft, kunde, objekt, firma, renderEditor }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [hotspots, setHotspots] = useState<RuntimeHotspot[]>([]);
  const [openHotspotId, setOpenHotspotId] = useState<string | null>(null);

  const [loadAttempt, setLoadAttempt] = useState(0);
  const [viewerSeq, setViewerSeq] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const pdfUrlRef = useRef<string | null>(null);

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
  const ctxKey = useMemo(() => semKey({ kunde, objekt, firma }), [kunde, objekt, firma]);
  // Build-Queue: nur der jüngste Eingabe-Stand wird gerendert.
  // - inFlightRef verhindert parallele Builds
  // - latestKeyRef hält den zuletzt angeforderten Stand fest
  // - viewerSeq erzeugt nur neue PDF.js-Daten, ohne ein zweites Document zu mounten
  const inFlightRef = useRef(false);
  const latestKeyRef = useRef<string>("");
  const builtKeyRef = useRef<string>("");
  // Aktuelle Daten als Ref, damit der Build-Loop immer den frischesten Stand nimmt.
  const dataRef = useRef({ draft, kunde, objekt, firma });
  dataRef.current = { draft, kunde, objekt, firma };

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const combinedKey = `${draftKey}|${ctxKey}`;
    latestKeyRef.current = combinedKey;
    if (builtKeyRef.current === combinedKey) return;

    const runBuild = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setRendering(true);
      setBuildError(null);
      try {
        // Schleife: solange der Ziel-Key sich ändert, neu bauen — immer den jüngsten Stand.
        while (mountedRef.current && builtKeyRef.current !== latestKeyRef.current) {
          const targetKey = latestKeyRef.current;
          const { draft: d, kunde: k, objekt: o, firma: f } = dataRef.current;
          const { blob, hotspots: hs } = await generateProtokollPdf(d, k, o, f);
          if (!mountedRef.current) return;
          if (!(blob instanceof Blob) || blob.size === 0) {
            throw new Error("PDF konnte nicht erzeugt werden (leerer Blob).");
          }
          const buf = await blob.arrayBuffer();
          if (!mountedRef.current) return;
          const newUrl = URL.createObjectURL(blob);

          if (targetKey !== latestKeyRef.current) {
            URL.revokeObjectURL(newUrl);
            continue;
          }

          builtKeyRef.current = targetKey;
          const previousUrl = pdfUrlRef.current;
          pdfUrlRef.current = newUrl;
          setHotspots(hs);
          setPdfBuffer(buf);
          setPdfUrl(newUrl);
          setLoadAttempt(0);
          setViewerSeq((n) => n + 1);
          if (previousUrl) URL.revokeObjectURL(previousUrl);
          setViewerError(null);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[ProtokollLivePreview] build failed", e);
        if (mountedRef.current) setBuildError(e instanceof Error ? e.message : "PDF-Fehler");
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) setRendering(false);
      }
    };

    const timer = setTimeout(() => {
      void runBuild();
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [draftKey, ctxKey]);

  // Snap auf 20-px-Schritte: kein Re-Render bei Scrollbar-Wackler.
  const renderWidthRaw = useMemo(() => {
    const raw = Math.min(Math.max(containerWidth - 16, 280), 900);
    return Math.round(raw / 20) * 20;
  }, [containerWidth]);
  const renderWidth = useDeferredValue(renderWidthRaw);
  const scale = renderWidth / A4.width;

  // Fallback, falls Tracker leer (selten).
  const effectiveHotspots: RuntimeHotspot[] = useMemo(() => {
    if (hotspots.length > 0) return hotspots;
    return FALLBACK_HOTSPOTS_PROTOKOLL_SEITE_1.map((f) => ({
      id: f.id,
      page: f.page,
      x: f.box.x * A4.width,
      y: f.box.y * A4.height,
      w: f.box.w * A4.width,
      h: f.box.h * A4.height,
    }));
  }, [hotspots]);

  // Frische Kopie pro Load — PDF.js detacht den Buffer im Worker.
  const fileSource = useMemo(
    () => (pdfBuffer ? { data: new Uint8Array(pdfBuffer.slice(0)) } : null),
    [pdfBuffer, viewerSeq, loadAttempt],
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
          key={`pdf-${loadAttempt}`}
          file={fileSource}
          onLoadSuccess={({ numPages }) => {
            setNumPages(numPages);
            setViewerError(null);
          }}
          onLoadError={(err) => {
            // eslint-disable-next-line no-console
            console.error("[ProtokollLivePreview] viewer error", {
              message: err?.message,
              byteLength: pdfBuffer?.byteLength ?? 0,
              viewerSeq,
              loadAttempt,
              kind: draft.kind,
              draftId: draft.id,
            });
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
          {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => {
            const pageHotspots = effectiveHotspots.filter((h) => h.page === n);
            return (
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
                {renderEditor && (
                  <PdfFieldOverlay
                    hotspots={pageHotspots}
                    scale={scale}
                    openId={openHotspotId}
                    onOpenChange={setOpenHotspotId}
                    renderEditor={renderEditor}
                    metaForId={protokollMetaForId}
                  />
                )}
              </div>
            );
          })}
        </Document>
      )}

      {viewerError && pdfBuffer && (
        <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 px-6 text-center text-sm">
          <p className="font-medium text-destructive">PDF kann nicht angezeigt werden</p>
          <p className="text-xs text-muted-foreground">{viewerError}</p>
          <p className="font-mono text-[10px] text-muted-foreground/70">
            Quelle: ArrayBuffer · {Math.round((pdfBuffer?.byteLength ?? 0) / 1024)} KB · Versuch {loadAttempt + 1}
          </p>
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