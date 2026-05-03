// Live-PDF-Vorschau für den Editor: rendert pdfmake-PDF aus dem Draft,
// debounced bei Änderungen, zeigt alle Seiten untereinander, mit klickbaren
// Hotspots pro Seite (Pixel-genau aus dem pdfmake-Layout-Tracker).

import { useEffect, useMemo, useRef, useState } from "react";
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

const DEBOUNCE_MS = 300;

export function LivePdfPreview(props: Props) {
  const { draft, kunde, firma, ansprechpartner, renderEditor, kind } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [hotspots, setHotspots] = useState<RuntimeHotspot[]>([]);
  const [numPages, setNumPages] = useState(0);
  const [rendering, setRendering] = useState(false);
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

  // Debounced PDF-Build — alte URL bleibt bis neue geladen ist (kein Flicker).
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setRendering(true);
      setBuildError(null);
      try {
        const result =
          kind === "angebot"
            ? await generateAngebotPdf(draft as Angebot, kunde, firma, ansprechpartner)
            : await generateRechnungPdf(draft as Rechnung, kunde, firma, ansprechpartner);
        if (cancelled) return;
        const newUrl = URL.createObjectURL(result.blob);
        setPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return newUrl;
        });
        setHotspots(result.hotspots);
        setViewerError(null);
      } catch (e) {
        console.error(e);
        if (!cancelled) setBuildError(e instanceof Error ? e.message : "PDF konnte nicht erzeugt werden.");
      } finally {
        if (!cancelled) setRendering(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft, kunde, firma, ansprechpartner, kind]);

  // URL-Cleanup bei Unmount
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderWidth = useMemo(
    () => Math.min(Math.max(containerWidth - 16, 280), 900),
    [containerWidth],
  );
  const scale = renderWidth / A4.width;

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
    <div ref={containerRef} className="relative h-full overflow-y-auto bg-muted/30 px-2 py-3 sm:px-4">
      {rendering && (
        <div className="pointer-events-none sticky top-2 z-20 ml-auto flex w-fit items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm ring-1 ring-border backdrop-blur">
          <Loader2 className="h-3 w-3 animate-spin" />
          aktualisiert …
        </div>
      )}

      {!pdfUrl && !buildError && containerWidth > 0 && (
        <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>PDF wird erzeugt …</span>
        </div>
      )}

      {buildError && !pdfUrl && (
        <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 px-6 text-center text-sm">
          <p className="font-medium text-destructive">PDF konnte nicht erzeugt werden</p>
          <p className="text-xs text-muted-foreground">{buildError}</p>
        </div>
      )}

      {buildError && pdfUrl && (
        <div className="sticky top-2 z-20 mx-auto mb-2 w-fit max-w-[90%] rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1 text-xs text-destructive">
          Vorschau veraltet — letzter Build fehlgeschlagen: {buildError}
        </div>
      )}

      {pdfUrl && containerWidth > 0 && !viewerError && (
        <Document
          file={pdfUrl}
          onLoadSuccess={({ numPages }) => {
            setNumPages(numPages);
            setViewerError(null);
          }}
          onLoadError={(err) => {
            console.error("[LivePdfPreview] Document load error", err);
            setViewerError(err?.message || String(err));
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

      {viewerError && pdfUrl && (
        <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 px-6 text-center text-sm">
          <p className="font-medium text-destructive">PDF kann nicht angezeigt werden</p>
          <p className="text-xs text-muted-foreground">{viewerError}</p>
          <a href={pdfUrl} download className="mt-2 text-xs underline text-primary">
            PDF trotzdem herunterladen
          </a>
        </div>
      )}
    </div>
  );
}
