import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "@tanstack/react-router";
import { Download, Loader2, AlertCircle, Pencil, ExternalLink } from "lucide-react";
import { DriveStatusBadge } from "./DriveStatusBadge";
import { PdfCanvasViewer } from "./PdfCanvasViewer";
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

  const isLoading = status === "loading" || (status === "ready" && !pdfUrl);
  const isError = status === "error";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 sm:h-[90vh] sm:max-h-[90vh] sm:w-[95vw] sm:max-w-5xl sm:rounded-lg sm:border">
        <DialogHeader className="flex-row items-center justify-between gap-2 space-y-0 border-b border-border px-3 py-2 sm:gap-3 sm:px-6 sm:py-3">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate pr-8 text-sm font-semibold sm:pr-0 sm:text-base">{title}</DialogTitle>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:mt-1">
              <DriveStatusBadge drive={drive} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {editTarget && (
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
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
            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-2 text-sm font-medium hover:bg-accent sm:px-3"
                aria-label="In neuem Tab öffnen"
              >
                <ExternalLink className="h-4 w-4" />
                <span className="hidden sm:inline">Öffnen</span>
              </a>
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

        <div className="flex-1 overflow-hidden bg-muted/30">
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

          {!isLoading && !isError && pdfUrl && (
            <PdfCanvasViewer
              pdfUrl={pdfUrl}
              fileName={fileName}
              className="h-full w-full overflow-y-auto bg-muted/30"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
