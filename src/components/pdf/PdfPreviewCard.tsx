import type { ReactNode } from "react";
import { FileText, Loader2, AlertCircle } from "lucide-react";
import { DriveStatusBadge } from "./DriveStatusBadge";
import type { DriveSyncInfo } from "@/lib/api/types";

interface Props {
  title: string;
  status: "idle" | "loading" | "ready" | "error";
  errorMessage?: string | null;
  drive?: DriveSyncInfo;
  viewButton: ReactNode;
  /** Wenn vorhanden, wird die PDF inline als kleine Vorschau eingebettet. */
  pdfUrl?: string | null;
}

/**
 * Kompakter Vorschau-Block auf Detailseiten.
 * Zeigt eine echte PDF-Vorschau (per nativer Browser-Anzeige), sobald die Blob-URL bereitsteht.
 */
export function PdfPreviewCard({ title, status, errorMessage, drive, viewButton, pdfUrl }: Props) {
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
            {status === "loading" && <span>PDF wird erzeugt …</span>}
            {status === "error" && (
              <span className="text-destructive">{errorMessage || "PDF konnte nicht erzeugt werden"}</span>
            )}
            {status === "ready" && <span>Vorschau bereit</span>}
            <DriveStatusBadge drive={drive} />
          </div>
        </div>
        <div className="shrink-0">{viewButton}</div>
      </div>

      <div className="border-t border-border bg-muted/30">
        {pdfUrl && status !== "error" ? (
          <object
            data={pdfUrl}
            type="application/pdf"
            className="block h-[70vh] w-full"
            aria-label={title}
          >
            <iframe
              src={pdfUrl}
              title={title}
              className="h-[70vh] w-full border-0"
            />
          </object>
        ) : (
          <div className="flex h-[40vh] items-center justify-center text-sm text-muted-foreground">
            {status === "loading" ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> PDF wird erzeugt …
              </span>
            ) : status === "error" ? (
              <span className="text-destructive">{errorMessage || "PDF konnte nicht erzeugt werden"}</span>
            ) : (
              <span>Noch keine Vorschau</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
