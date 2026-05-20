// Live-PDF-Vorschau für Protokolle.
//
// Zwei dauerhaft existierende Document-Slots (A / B) liegen absolut
// gestapelt im Container. Der vordere Slot ist sichtbar (opacity 1),
// der hintere lädt im Hintergrund (opacity 0). Erst wenn ALLE Pages des
// hinteren Slots `onRenderSuccess` gemeldet haben, wird via opacity-
// Transition getauscht. Damit ist die alte PDF nie auch nur ein Frame
// lang weg.
//
// Der Hotspot/Popover-Layer hängt NICHT mehr unter dem <Document>-Baum.
// Er liegt als eigener absolute Layer darüber. Folge: wenn react-pdf
// intern Pages neu mountet, bleibt das offene Popover (mit Input und
// Caret-Position) ungestört.
//
// Solange ein Popover offen ist, wird der Slot-Swap aufgeschoben — die
// Hotspot-Geometrie ist während des Tippens eingefroren, kein Layout-
// Sprung. Sobald der User das Popover schließt (oder den Tab wechselt /
// Window-Blur), wird gewartete Version sichtbar.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { configurePdfWorker } from "@/lib/pdf/pdfjsWorker";

configurePdfWorker();

import { AlertCircle, Loader2 } from "lucide-react";
import { generateProtokollPdf } from "@/lib/pdf/werkzeugePdf";
import type { Protokoll, Kunde, Objekt, Firmendaten } from "@/lib/api/types";
import { PdfFieldOverlay, type TableAction } from "@/components/pdf-editor/PdfFieldOverlay";
import {
  protokollMetaForId,
  FALLBACK_HOTSPOTS_PROTOKOLL_SEITE_1,
} from "@/lib/pdf/fieldMap";
import { A4, type RuntimeHotspot } from "@/lib/pdf/hotspotTracker";

const DEBOUNCE_MS = 450;
const TYPING_DEBOUNCE_MS = 1100;
const LOADER_DELAY_MS = 350;
const FADE_MS = 140;
const PAGE_GAP_PX = 16;
const VOLATILE = new Set(["aktualisiertAm", "erstelltAm", "updatedAt", "createdAt"]);

function semKey<T>(o: T) {
  return JSON.stringify(o, (k, v) => (VOLATILE.has(k) ? undefined : v));
}

export interface ProtokollLivePreviewHandle {
  /** Sofortigen Build erzwingen (debounce überspringen). */
  flush: () => void;
}

type SlotId = "A" | "B";
interface SlotState {
  buffer: ArrayBuffer | null;
  hotspots: RuntimeHotspot[];
  numPages: number;
  /** Anzahl Pages, die bereits `onRenderSuccess` gemeldet haben. */
  rendered: number;
  /** Eindeutiger Bau-Schlüssel; ändert sich bei jedem neuen Build. */
  buildId: number;
}

const EMPTY_SLOT: SlotState = {
  buffer: null,
  hotspots: [],
  numPages: 0,
  rendered: 0,
  buildId: 0,
};

interface Props {
  draft: Protokoll;
  kunde?: Kunde;
  objekt?: Objekt;
  firma?: Firmendaten;
  renderEditor?: (fieldId: string, close: () => void) => React.ReactNode;
  tableActions?: TableAction;
}

export const ProtokollLivePreview = forwardRef<ProtokollLivePreviewHandle, Props>(
  function ProtokollLivePreview(
    { draft, kunde, objekt, firma, renderEditor, tableActions },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    const [slotA, setSlotA] = useState<SlotState>(EMPTY_SLOT);
    const [slotB, setSlotB] = useState<SlotState>(EMPTY_SLOT);
    const [front, setFront] = useState<SlotId>("A");

    const [openHotspotId, setOpenHotspotId] = useState<string | null>(null);
    const [building, setBuilding] = useState(false);
    const [showLoader, setShowLoader] = useState(false);
    const [buildError, setBuildError] = useState<string | null>(null);

    const mountedRef = useRef(true);
    const inFlightRef = useRef(false);
    const buildSeqRef = useRef(0);
    const builtKeyRef = useRef<string>("");
    const latestKeyRef = useRef<string>("");
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSwapAtRef = useRef(0);
    const typingTsRef = useRef(0);
    const openIdRef = useRef<string | null>(null);
    openIdRef.current = openHotspotId;
    const dataRef = useRef({ draft, kunde, objekt, firma });
    dataRef.current = { draft, kunde, objekt, firma };

    // Container-Breite messen
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
      return () => {
        mountedRef.current = false;
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      };
    }, []);

    // Loader-Indikator erst nach kurzer Wartezeit zeigen.
    useEffect(() => {
      if (!building) {
        setShowLoader(false);
        return;
      }
      const t = setTimeout(() => setShowLoader(true), LOADER_DELAY_MS);
      return () => clearTimeout(t);
    }, [building]);

    // Tipp-Aktivität in Inline-Inputs erkennen (auch wenn das Popover
    // in einem Portal außerhalb unseres Containers liegt). Wir setzen
    // einen Zeitstempel; das nutzt der Scheduler, um den Debounce-Wert
    // dynamisch zu verlängern.
    useEffect(() => {
      if (!openHotspotId) return;
      const onInput = (e: Event) => {
        const t = e.target as HTMLElement | null;
        if (!t) return;
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") {
          typingTsRef.current = Date.now();
        }
      };
      document.addEventListener("input", onInput, true);
      return () => document.removeEventListener("input", onInput, true);
    }, [openHotspotId]);

    const currentKey = useMemo(
      () => semKey({ draft, kunde, objekt, firma, kind: draft.kind }),
      [draft, kunde, objekt, firma],
    );
    latestKeyRef.current = currentKey;

    const scheduleBuildRef = useRef<() => void>(() => {});

    const runBuild = useCallback(async () => {
      if (inFlightRef.current) return;
      const targetKey = latestKeyRef.current;
      if (builtKeyRef.current === targetKey) return;

      inFlightRef.current = true;
      setBuilding(true);
      setBuildError(null);
      const buildId = ++buildSeqRef.current;

      try {
        const { draft: d, kunde: k, objekt: o, firma: f } = dataRef.current;
        const t0 = performance.now();
        const { blob, hotspots: hs } = await generateProtokollPdf(d, k, o, f);
        if (!mountedRef.current) return;
        if (!(blob instanceof Blob) || blob.size === 0) {
          throw new Error("PDF konnte nicht erzeugt werden (leerer Blob).");
        }
        const buf = await blob.arrayBuffer();
        if (!mountedRef.current) return;

        // eslint-disable-next-line no-console
        console.debug(`[protokoll-build #${buildId}] ${Math.round(performance.now() - t0)}ms`);

        // In den HINTEREN Slot schreiben. Wenn der vordere noch leer ist
        // (erster Build), schreiben wir dorthin und der Slot wird sofort
        // sichtbar.
        const isFirstBuild =
          (front === "A" ? slotA.buffer : slotB.buffer) === null;
        const target: SlotId = isFirstBuild ? front : front === "A" ? "B" : "A";
        const next: SlotState = {
          buffer: buf,
          hotspots: hs,
          numPages: 0,
          rendered: 0,
          buildId,
        };
        const commit = () => {
          if (!mountedRef.current) return;
          if (target === "A") setSlotA(next);
          else setSlotB(next);
        };
        // Wenn der Ziel-Slot gerade noch sichtbar ausfadet (Swap < FADE_MS her),
        // verschieben wir den Commit bis nach dem Fade. Sonst würde der noch
        // sichtbare Inhalt schlagartig durch numPages=0 verschwinden = Flackern.
        const sinceSwap = Date.now() - lastSwapAtRef.current;
        const wait = !isFirstBuild ? Math.max(0, FADE_MS + 60 - sinceSwap) : 0;
        builtKeyRef.current = targetKey;
        if (wait > 0) {
          if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
          commitTimerRef.current = setTimeout(() => {
            commitTimerRef.current = null;
            commit();
          }, wait);
        } else {
          commit();
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[ProtokollLivePreview] build failed", e);
        if (mountedRef.current) {
          setBuildError(e instanceof Error ? e.message : "PDF-Fehler");
        }
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) {
          setBuilding(false);
          // Folge-Builds gehen IMMER durch den Debounce — sonst feuern
          // mehrere Updates (Query-Refetches, Autosave-Roundtrips) in
          // schneller Folge ein Build/Swap nach dem anderen = Flackern.
          if (latestKeyRef.current !== builtKeyRef.current) {
            scheduleBuildRef.current();
          }
        }
      }
    }, [front, slotA.buffer, slotB.buffer]);

    const scheduleBuild = useCallback(() => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      const sinceTyping = Date.now() - typingTsRef.current;
      const popoverOpen = openIdRef.current !== null;
      const recentTyping = popoverOpen && sinceTyping < TYPING_DEBOUNCE_MS;
      const delay = recentTyping ? TYPING_DEBOUNCE_MS : DEBOUNCE_MS;
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        // Re-Check: falls in der Wartezeit getippt wurde, noch einmal warten.
        if (
          openIdRef.current !== null &&
          Date.now() - typingTsRef.current < 900
        ) {
          scheduleBuild();
          return;
        }
        void runBuild();
      }, delay);
    }, [runBuild]);
    scheduleBuildRef.current = scheduleBuild;

    const flush = useCallback(() => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (latestKeyRef.current === builtKeyRef.current) return;
      void runBuild();
    }, [runBuild]);

    useImperativeHandle(ref, () => ({ flush }), [flush]);

    // Erster Build, sobald Container vermessen ist.
    const didInitRef = useRef(false);
    useEffect(() => {
      if (didInitRef.current) return;
      if (containerWidth === 0) return;
      didInitRef.current = true;
      void runBuild();
    }, [containerWidth, runBuild]);

    // Reagiere auf Draft/Context-Änderungen → debounced rebuild.
    useEffect(() => {
      if (!didInitRef.current) return;
      if (builtKeyRef.current === currentKey) return;
      scheduleBuild();
    }, [currentKey, scheduleBuild]);

    // Tab-Wechsel / Window-Blur → sofort flushen (aber Swap wartet noch
    // auf Render-Erfolg + ggf. Popover-Schließung).
    useEffect(() => {
      const onBlur = () => flush();
      const onVis = () => {
        if (document.visibilityState === "hidden") flush();
      };
      window.addEventListener("blur", onBlur);
      document.addEventListener("visibilitychange", onVis);
      return () => {
        window.removeEventListener("blur", onBlur);
        document.removeEventListener("visibilitychange", onVis);
      };
    }, [flush]);

    // ── Swap-Logik ────────────────────────────────────────────────────────
    // Wenn der HINTERE Slot fertig gerendert ist UND kein Popover offen ist
    // UND er eine neuere buildId als der vordere hat, dann tauschen.
    const frontSlot = front === "A" ? slotA : slotB;
    const backSlot = front === "A" ? slotB : slotA;
    const backReady =
      backSlot.buffer !== null &&
      backSlot.numPages > 0 &&
      backSlot.rendered >= backSlot.numPages &&
      backSlot.buildId > frontSlot.buildId;

    useEffect(() => {
      if (!backReady) return;
      if (openHotspotId !== null) return; // Swap aufschieben — Popover offen
      lastSwapAtRef.current = Date.now();
      setFront((f) => (f === "A" ? "B" : "A"));
    }, [backReady, openHotspotId]);

    // ── Page-Geometrie ────────────────────────────────────────────────────
    const renderWidth = useMemo(() => {
      const raw = Math.min(Math.max(containerWidth - 16, 280), 900);
      return Math.round(raw / 20) * 20;
    }, [containerWidth]);
    const scale = renderWidth / A4.width;
    const pageHeight = useMemo(
      () => Math.round(A4.height * scale),
      [scale],
    );

    // Hotspots aus dem aktuell sichtbaren Slot — eingefroren, solange ein
    // Popover offen ist (damit die Box nicht unter dem Klick wegrutscht).
    const frozenHotspotsRef = useRef<RuntimeHotspot[]>([]);
    const frozenNumPagesRef = useRef(0);
    const liveHotspots = frontSlot.hotspots;
    const liveNumPages = frontSlot.numPages;
    if (openHotspotId === null) {
      frozenHotspotsRef.current = liveHotspots;
      frozenNumPagesRef.current = liveNumPages;
    }
    const overlayHotspots =
      openHotspotId !== null ? frozenHotspotsRef.current : liveHotspots;
    const overlayNumPages =
      openHotspotId !== null
        ? Math.max(frozenNumPagesRef.current, liveNumPages)
        : liveNumPages;

    const effectiveHotspots: RuntimeHotspot[] = useMemo(() => {
      if (overlayHotspots.length > 0) return overlayHotspots;
      return FALLBACK_HOTSPOTS_PROTOKOLL_SEITE_1.map((f) => ({
        id: f.id,
        page: f.page,
        x: f.box.x * A4.width,
        y: f.box.y * A4.height,
        w: f.box.w * A4.width,
        h: f.box.h * A4.height,
      }));
    }, [overlayHotspots]);

    // Slot-Setter (fresh aus dem State, sonst Stale-Closures bei mehreren Pages).
    const handleLoadSuccess = useCallback(
      (slot: SlotId, expectedBuildId: number, numPages: number) => {
        const setter = slot === "A" ? setSlotA : setSlotB;
        setter((prev) => {
          if (prev.buildId !== expectedBuildId) return prev;
          return { ...prev, numPages, rendered: 0 };
        });
      },
      [],
    );
    const handlePageRendered = useCallback(
      (slot: SlotId, expectedBuildId: number) => {
        const setter = slot === "A" ? setSlotA : setSlotB;
        setter((prev) => {
          if (prev.buildId !== expectedBuildId) return prev;
          if (prev.numPages === 0) return prev;
          const rendered = Math.min(prev.numPages, prev.rendered + 1);
          if (rendered === prev.rendered) return prev;
          return { ...prev, rendered };
        });
      },
      [],
    );

    const containerInnerHeight = useMemo(() => {
      const pages = Math.max(frontSlot.numPages, 1);
      return pages * pageHeight + (pages - 1) * PAGE_GAP_PX;
    }, [frontSlot.numPages, pageHeight]);

    const hasAnyPdf = slotA.buffer !== null || slotB.buffer !== null;

    return (
      <div
        ref={containerRef}
        className="relative h-full overflow-y-auto bg-muted/30 px-2 py-3 sm:px-4"
      >
        {/* Subtiler Status-Indikator */}
        {(showLoader && building) || buildError ? (
          <div className="pointer-events-none sticky top-2 z-30 mb-2 flex justify-end">
            <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-background/90 px-2 py-1 text-[10px] text-muted-foreground shadow-sm ring-1 ring-border backdrop-blur">
              {buildError ? (
                <span
                  title={buildError}
                  className="flex items-center gap-1 text-destructive"
                >
                  <AlertCircle className="h-2.5 w-2.5" />
                  Aktualisierung fehlgeschlagen
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  aktualisiert …
                </span>
              )}
            </div>
          </div>
        ) : null}

        {!hasAnyPdf && !buildError && containerWidth > 0 && (
          <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>PDF wird erzeugt …</span>
          </div>
        )}

        {buildError && !hasAnyPdf && (
          <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 px-6 text-center text-sm">
            <p className="font-medium text-destructive">PDF konnte nicht erzeugt werden</p>
            <p className="text-xs text-muted-foreground">{buildError}</p>
          </div>
        )}

        {containerWidth > 0 && hasAnyPdf && (
          <div
            className="relative mx-auto"
            style={{
              width: renderWidth,
              height: containerInnerHeight,
            }}
          >
            <DocumentSlot
              slot="A"
              state={slotA}
              renderWidth={renderWidth}
              pageHeight={pageHeight}
              visible={front === "A"}
              onLoadSuccess={handleLoadSuccess}
              onPageRendered={handlePageRendered}
            />
            <DocumentSlot
              slot="B"
              state={slotB}
              renderWidth={renderWidth}
              pageHeight={pageHeight}
              visible={front === "B"}
              onLoadSuccess={handleLoadSuccess}
              onPageRendered={handlePageRendered}
            />

            {/* Interaktions-Layer: liegt ÜBER beiden Documents.
                Wird nicht remountet, wenn react-pdf intern Pages wechselt. */}
            {renderEditor && (
              <div
                className="pointer-events-none absolute inset-0 z-10"
                aria-hidden={false}
              >
                {Array.from({ length: Math.max(overlayNumPages, 1) }, (_, i) => i + 1).map(
                  (pageNum) => {
                    const pageHotspots = effectiveHotspots.filter((h) => h.page === pageNum);
                    const top = (pageNum - 1) * (pageHeight + PAGE_GAP_PX);
                    return (
                      <div
                        key={pageNum}
                        className="absolute left-0"
                        style={{ top, width: renderWidth, height: pageHeight }}
                      >
                        <PdfFieldOverlay
                          hotspots={pageHotspots}
                          scale={scale}
                          openId={openHotspotId}
                          onOpenChange={(id) => {
                            setOpenHotspotId(id);
                            if (id === null) flush();
                          }}
                          renderEditor={renderEditor}
                          metaForId={protokollMetaForId}
                          tableActions={tableActions}
                        />
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Ein einzelner Document-Slot (rein visuell). Beide Slots existieren
// permanent; nur opacity wechselt.
// ─────────────────────────────────────────────────────────────────────────

interface DocumentSlotProps {
  slot: SlotId;
  state: SlotState;
  renderWidth: number;
  pageHeight: number;
  visible: boolean;
  onLoadSuccess: (slot: SlotId, buildId: number, numPages: number) => void;
  onPageRendered: (slot: SlotId, buildId: number) => void;
}

function DocumentSlot({
  slot,
  state,
  renderWidth,
  pageHeight,
  visible,
  onLoadSuccess,
  onPageRendered,
}: DocumentSlotProps) {
  // Frische Kopie pro Document-Load — sonst detacht PDF.js den Buffer.
  const fileSource = useMemo(
    () =>
      state.buffer
        ? { data: new Uint8Array(state.buffer.slice(0)) }
        : null,
    [state.buffer],
  );

  if (!fileSource) return null;
  return (
    <div
      className="absolute inset-0 transition-opacity"
      style={{
        opacity: visible ? 1 : 0,
        transitionDuration: `${FADE_MS}ms`,
        pointerEvents: "none",
      }}
      aria-hidden={!visible}
    >
      <Document
        file={fileSource}
        onLoadSuccess={({ numPages }) =>
          onLoadSuccess(slot, state.buildId, numPages)
        }
        onLoadError={(err) => {
          // eslint-disable-next-line no-console
          console.error(`[ProtokollLivePreview] slot ${slot} load error`, err);
        }}
        loading={null}
        error={null}
        className="flex w-full flex-col items-center"
      >
        {Array.from({ length: state.numPages }, (_, i) => i + 1).map((pageNum) => (
          <div
            key={pageNum}
            className="overflow-hidden rounded-md bg-background shadow-sm ring-1 ring-border"
            style={{
              width: renderWidth,
              height: pageHeight,
              marginTop: pageNum === 1 ? 0 : PAGE_GAP_PX,
            }}
          >
            <Page
              pageNumber={pageNum}
              width={renderWidth}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              onRenderSuccess={() => onPageRendered(slot, state.buildId)}
            />
          </div>
        ))}
      </Document>
    </div>
  );
}