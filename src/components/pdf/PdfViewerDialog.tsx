import { useEffect, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import "@/lib/pdf/pdfjsWorker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, AlertCircle } from "lucide-react";
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
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);

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
        className="flex h-[90vh] max-h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 overflow-hidden bg-background p-0"
      >
        <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b border-border px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base font-semibold">{title}</DialogTitle>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
          <Button
            asChild
            variant="outline"
            size="sm"
            disabled={!pdfUrl}
            className="shrink-0"
          >
            {pdfUrl ? (
              <a href={pdfUrl} download={fileName}>
                <Download className="mr-1.5 h-4 w-4" />
                Download
              </a>
            ) : (
              <span>
                <Download className="mr-1.5 h-4 w-4" />
                Download
              </span>
            )}
          </Button>
        </DialogHeader>

        <div ref={containerRef} className="flex-1 overflow-y-auto bg-muted/30 px-2 py-4 sm:px-6">
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

          {!isLoading && !isError && pdfUrl && containerWidth > 0 && (
            <Document
              file={pdfUrl}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}
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
                    width={Math.min(containerWidth - 16, 900)}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                  />
                </div>
              ))}
            </Document>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
