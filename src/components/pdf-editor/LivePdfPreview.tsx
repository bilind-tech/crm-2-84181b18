// Snapshot-PDF-Vorschau für den Beleg-Editor (Angebot / Rechnung).
//
// Designziel: keinerlei Flackern beim Tippen. Die PDF wird NICHT live bei
// jeder Änderung neu gebaut. Stattdessen:
//   - Initial einmal bauen → stabil anzeigen.
//   - Jede weitere Eingabe markiert die Vorschau als „nicht aktuell"
//     (kleiner ruhiger Status oben rechts) und blendet einen
//     „Aktualisieren"-Button ein.
//   - Klick → genau ein neuer Build → atomarer Swap, ohne `<Document>`
//     neu zu mounten.
//   - Build-Fehler lassen die zuletzt funktionierende PDF stehen.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { configurePdfWorker } from "@/lib/pdf/pdfjsWorker";

configurePdfWorker();

import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateAngebotPdf, generateRechnungPdf } from "@/lib/pdf/belegPdf";
import type { Angebot, Rechnung, Kunde, Firmendaten, Ansprechpartner } from "@/lib/api/types";
import { PdfFieldOverlay, type RowAction, type TableAction } from "./PdfFieldOverlay";
import { A4 } from "@/lib/pdf/hotspotTracker";
import type { RuntimeHotspot } from "@/lib/pdf/hotspotTracker";
import { FALLBACK_HOTSPOTS_SEITE_1 } from "@/lib/pdf/fieldMap";

interface CommonProps {
  kunde: Kunde;
  firma: Firmendaten;
  ansprechpartner?: Ansprechpartner;
  /** Inline-Editor pro Hotspot (Render-Prop). */
  renderEditor: (fieldId: string, close: () => void) => React.ReactNode;
  /** Aktionen für `pos:`-Zeilen. */
  rowActions?: RowAction;
  /** Aktionen für den `tabelle`-Hotspot. */
  tableActions?: TableAction;
}

type Props =
  | ({ kind: "angebot"; draft: Angebot } & CommonProps)
  | ({ kind: "rechnung"; draft: Rechnung } & CommonProps);

// Volatile Server-Felder aus dem Vergleich ausschließen, damit Autosave-Echos
// (Timestamps) die Vorschau nie als „nicht aktuell" markieren.
const VOLATILE_KEYS = new Set(["aktualisiertAm", "updatedAt", "erstelltAm", "createdAt"]);
function semanticKey(obj: unknown): string {
  return JSON.stringify(obj, (k, v) => (VOLATILE_KEYS.has(k) ? undefined : v));
}

export function LivePdfPreview(props: Props) {
  const { draft, kunde, firma, ansprechpartner, renderEditor, kind, rowActions, tableActions } =
    props;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

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

  // Aktueller semantischer Snapshot-Key des Drafts (+ Kontext).
  const currentKey = useMemo(
    () => semanticKey({ draft, kunde, firma, ansprechpartner, kind }),
    [draft, kunde, firma, ansprechpartner, kind],
  );

  // Letzter erfolgreich gebauter Key → daraus leitet sich „aktuell?" ab.
  const [builtKey, setBuiltKey] = useState<string | null>(null);

  // Sichtbarer Stand: stabiler ArrayBuffer + Hotspots + numPages bleiben so
  // lange unverändert, bis ein neuer Build vollständig durch ist.
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [hotspots, setHotspots] = useState<RuntimeHotspot[]>([]);
  const [numPages, setNumPages] = useState(0);

  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [openHotspotId, setOpenHotspotId] = useState<string | null>(null);

  // Build-Queue: genau ein Build gleichzeitig; bei laufendem Build wird nur
  // der zuletzt gewünschte Key am Ende neu gebaut.
  const inFlightRef = useRef(false);
  const queuedKeyRef = useRef<string | null>(null);
  const latestPropsRef = useRef({ draft, kunde, firma, ansprechpartner, kind });
  latestPropsRef.current = { draft, kunde, firma, ansprechpartner, kind };

  const runBuild = useCallback(async () => {
    if (inFlightRef.current) {
      queuedKeyRef.current = currentKey;
      return;
    }
    inFlightRef.current = true;
    setBuilding(true);
    setBuildError(null);
    const targetKey = currentKey;
    const snap = latestPropsRef.current;
    try {
      const result =
        snap.kind === "angebot"
          ? await generateAngebotPdf(snap.draft as Angebot, snap.kunde, snap.firma, snap.ansprechpartner)
          : await generateRechnungPdf(snap.draft as Rechnung, snap.kunde, snap.firma, snap.ansprechpartner);
      if (!(result.blob instanceof Blob) || result.blob.size === 0) {
        throw new Error("PDF konnte nicht erzeugt werden (leerer Blob).");
      }
      const buf = await result.blob.arrayBuffer();
      setPdfBuffer(buf);
      setHotspots(result.hotspots);
      setBuiltKey(targetKey);
      setViewerError(null);
    } catch (e) {
      console.error(e);
      setBuildError(e instanceof Error ? e.message : "PDF konnte nicht erzeugt werden.");
    } finally {
      inFlightRef.current = false;
      setBuilding(false);
      const queued = queuedKeyRef.current;
      queuedKeyRef.current = null;
      if (queued && queued !== targetKey) {
        // Nur falls jemand explizit angefragt hatte, während wir bauten.
        // (Wir triggern hier KEIN automatisches Rebuild bei reinen Tipp-Diffs.)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  // Erster Build (einmalig, sobald Container vermessen ist).
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    if (containerWidth === 0) return;
    didInitRef.current = true;
    void runBuild();
  }, [containerWidth, runBuild]);

  const isStale = builtKey !== null && builtKey !== currentKey;

  const renderWidth = useMemo(() => {
    const raw = Math.min(Math.max(containerWidth - 16, 280), 900);
    return Math.round(raw / 20) * 20;
  }, [containerWidth]);
  const scale = renderWidth / A4.width;

  // Frische Kopie pro Document-Load — sonst detacht PDF.js den Buffer.
  // Referenz wechselt NUR wenn ein neuer Build erfolgreich war.
  const fileSource = useMemo(
    () => (pdfBuffer ? { data: new Uint8Array(pdfBuffer.slice(0)) } : null),
    [pdfBuffer],
  );

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
      {/* Status-Leiste: aktuell / nicht aktuell / wird aktualisiert */}
      {pdfBuffer && (
        <div className="pointer-events-none sticky top-2 z-20 mb-2 flex justify-end">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-background/85 px-2 py-1 text-[11px] text-muted-foreground shadow-sm ring-1 ring-border backdrop-blur">
            {building ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                wird aktualisiert …
              </span>
            ) : isStale ? (
              <>
                <span className="text-amber-600 dark:text-amber-400">Vorschau nicht aktuell</span>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-6 rounded-full px-2 text-[11px]"
                  onClick={() => void runBuild()}
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Aktualisieren
                </Button>
              </>
            ) : (
              <span>Vorschau aktuell</span>
            )}
          </div>
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
          <Button size="sm" variant="outline" className="mt-2" onClick={() => void runBuild()}>
            <RefreshCw className="mr-1 h-3 w-3" />
            Erneut versuchen
          </Button>
        </div>
      )}

      {buildError && pdfBuffer && (
        <div className="mx-auto mb-2 w-fit max-w-[90%] rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1 text-xs text-destructive">
          Letzter Build fehlgeschlagen: {buildError}
        </div>
      )}

      {fileSource && containerWidth > 0 && !viewerError && (
        <Document
          file={fileSource}
          onLoadSuccess={({ numPages: n }) => {
            setNumPages(n);
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
                  rowActions={rowActions}
                  tableActions={tableActions}
                />
              </div>
            );
          })}
        </Document>
      )}

      {viewerError && pdfBuffer && (
        <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 px-6 text-center text-sm">
          <p className="font-medium text-destructive">PDF kann nicht angezeigt werden</p>
          <p className="text-xs text-muted-foreground">{viewerError}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => void runBuild()}>
            <RefreshCw className="mr-1 h-3 w-3" />
            Erneut versuchen
          </Button>
        </div>
      )}
    </div>
  );
}