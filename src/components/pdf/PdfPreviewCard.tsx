import type { ReactNode } from "react";
import { FileText, Loader2, AlertCircle } from "lucide-react";
import { DriveStatusBadge } from "./DriveStatusBadge";
import { PdfCanvasViewer } from "./PdfCanvasViewer";
import type { DriveSyncInfo } from "@/lib/api/types";

interface Props {
  title: string;
  status: "idle" | "loading" | "ready" | "error";
  errorMessage?: string | null;
  drive?: DriveSyncInfo;
  viewButton: ReactNode;
  /** Wenn vorhanden, wird die PDF inline als kleine Vorschau (Seite 1) eingebettet. */
  pdfUrl?: string | null;
  /** Datei­name für Download-Fallback im Viewer. */
  fileName?: string;
}

/**
 * Kompakter Vorschau-Block auf Detailseiten.
 * Rendert die erste Seite der PDF zuverlässig per Canvas (PDF.js),
 * unabhängig vom nativen Browser-PDF-Plugin.
 */
export function PdfPreviewCard({
  title,
  status,
  errorMessage,
  drive,
  viewButton,
  pdfUrl,
  fileName,
}: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-start gap-4 p-5">
        <div className="grid h-11 w-11 shrink-0 place-content-center rounded-xl bg-muted">
          {status === "loading" ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : status === "error" ? (
            <AlertCircle className="h-5 w-5 text-destructive" />
          ) : (
            <FileText className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="font-semibold">{title}</div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {status === "loading" && !pdfUrl && <span>PDF wird erstellt …</span>}
            {status === "error" && (
              <span className="text-destructive">{errorMessage || "PDF konnte nicht erstellt werden"}</span>
            )}
            {status === "ready" && <span>Vorschau bereit</span>}
            {status === "loading" && pdfUrl && <span>Vorschau bereit</span>}
            <DriveStatusBadge drive={drive} />
          </div>
        </div>
        <div className="shrink-0">{viewButton}</div>
      </div>

      <div className="border-t border-border bg-muted/30">
        {pdfUrl && status !== "error" ? (
          <PdfCanvasViewer
            pdfUrl={pdfUrl}
            fileName={fileName ?? `${title}.pdf`}
            className="block max-h-[70vh] w-full overflow-y-auto"
            firstPageOnly
            maxWidth={720}
          />
        ) : (
          <div className="flex h-[40vh] items-center justify-center text-sm text-muted-foreground">
            {status === "loading" ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> PDF wird erstellt …
              </span>
            ) : status === "error" ? (
              <span className="text-destructive">{errorMessage || "PDF konnte nicht erstellt werden"}</span>
            ) : (
              <span>Noch keine Vorschau</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
