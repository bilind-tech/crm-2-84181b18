import { useEffect, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { configurePdfWorker } from "@/lib/pdf/pdfjsWorker";

// react-pdf v10: workerSrc MUSS im gleichen Modul wie <Document> gesetzt werden.
configurePdfWorker();
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "@tanstack/react-router";

import { Download, Loader2, AlertCircle, Pencil } from "lucide-react";
import { DriveStatusBadge } from "./DriveStatusBadge";
import type { DriveSyncInfo } from "@/lib/api/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  pdfUrl: string | null;
  status: "idle" | "loading" | "ready" | "error";
  errorMessage?: string | null;
  fileName: string;
  drive?: DriveSyncInfo;
  /** Wenn gesetzt, wird oben rechts ein „PDF bearbeiten"-Button gezeigt, der zum Editor navigiert. */
  editTarget?: { kind: "angebot" | "rechnung"; id: string };
}

export function PdfViewerDialog({
  open,
  onOpenChange,
  title,
  pdfUrl,
  status,
  errorMessage,
  fileName,
  drive,
  editTarget,
}: Props) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [viewerError, setViewerError] = useState<string | null>(null);

  // Reset Viewer-Fehler, wenn neue PDF reinkommt
  useEffect(() => {
    setViewerError(null);
    setNumPages(0);
  }, [pdfUrl]);

  // Container-Breite messen für responsive PDF-Skalierung
  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  // Aktuelle Seite per IntersectionObserver tracken
  useEffect(() => {
    if (!open || numPages === 0) return;
    const root = containerRef.current;
    if (!root) return;
    const pageEls = root.querySelectorAll("[data-pdf-page]");
    if (!pageEls.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const n = Number((visible.target as HTMLElement).dataset.pdfPage);
          if (n) setCurrentPage(n);
        }
      },
      { root, threshold: [0.25, 0.5, 0.75] },
    );
    pageEls.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [open, numPages]);

  const isLoading = status === "loading" || (status === "ready" && !pdfUrl);
  const isError = status === "error";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 sm:h-[90vh] sm:max-h-[90vh] sm:w-[95vw] sm:max-w-5xl sm:rounded-lg sm:border"
      >
        <DialogHeader className="flex-row items-center justify-between gap-2 space-y-0 border-b border-border px-3 py-2 sm:gap-3 sm:px-6 sm:py-3">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate pr-8 text-sm font-semibold sm:pr-0 sm:text-base">{title}</DialogTitle>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:mt-1">
              {numPages > 0 ? (
                <span>
                  Seite <span className="font-medium text-foreground">{currentPage}</span> von{" "}
                  <span className="font-medium text-foreground">{numPages}</span>
                </span>
              ) : (
                <span>—</span>
              )}
              <span aria-hidden>·</span>
              <DriveStatusBadge drive={drive} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {editTarget && (
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  // Kurze Verzögerung, damit der Dialog sauber schließt, bevor wir navigieren.
                  setTimeout(() => {
                    if (editTarget.kind === "rechnung") {
                      void navigate({ to: "/rechnungen/$id/bearbeiten", params: { id: editTarget.id } });
                    } else {
                      void navigate({ to: "/angebote/$id/bearbeiten", params: { id: editTarget.id } });
                    }
                  }, 50);
                }}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-2 text-sm font-medium hover:bg-accent sm:px-3"
                aria-label="PDF bearbeiten"
              >
                <Pencil className="h-4 w-4" />
                <span className="hidden sm:inline">PDF bearbeiten</span>
              </button>
            )}
            {pdfUrl ? (
              <a
                href={pdfUrl}
                download={fileName}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-2 text-sm font-medium hover:bg-accent sm:px-3"
                aria-label="Download"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Download</span>
              </a>
            ) : (
              <span className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-2 text-sm font-medium opacity-50 sm:px-3">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Download</span>
              </span>
            )}
          </div>
        </DialogHeader>

        <div ref={containerRef} className="flex-1 overflow-y-auto bg-muted/30 px-1 py-3 sm:px-6 sm:py-4">
          {isLoading && (
            <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>PDF wird erzeugt …</span>
            </div>
          )}

          {isError && (
            <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-destructive">
              <AlertCircle className="h-6 w-6" />
              <div className="font-medium">PDF konnte nicht erzeugt werden</div>
              {errorMessage && <div className="text-xs text-muted-foreground">{errorMessage}</div>}
            </div>
          )}

          {!isLoading && !isError && pdfUrl && containerWidth > 0 && !viewerError && (
            <Document
              file={pdfUrl}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}
              onLoadError={(err) => {
                console.error("[PdfViewerDialog] Document load error", err);
                setViewerError(err?.message || String(err));
              }}
              loading={
                <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Wird geladen …
                </div>
              }
              error={
                <div className="text-sm text-destructive">PDF kann nicht angezeigt werden.</div>
              }
              className="flex flex-col items-center gap-4"
            >
              {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                <div
                  key={pageNum}
                  data-pdf-page={pageNum}
                  className="overflow-hidden rounded-md bg-background shadow-sm ring-1 ring-border"
                >
                  <Page
                    pageNumber={pageNum}
                    width={Math.min(containerWidth - 4, 900)}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                    onRenderError={(err) => {
                      console.error("[PdfViewerDialog] Page render error", err);
                    }}
                  />
                </div>
              ))}
            </Document>
          )}

          {viewerError && (
            <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-destructive">
              <AlertCircle className="h-6 w-6" />
              <div className="font-medium">PDF kann nicht angezeigt werden</div>
              <div className="text-xs text-muted-foreground">{viewerError}</div>
              {pdfUrl && (
                <a href={pdfUrl} download={fileName} className="mt-2 text-xs underline text-primary">
                  PDF trotzdem herunterladen
                </a>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
