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
}

/**
 * Kompakter Vorschau-Block auf Detailseiten — ersetzt die schwere Inline-iframe.
 * Klick auf den Button öffnet den vollwertigen PdfViewerDialog.
 */
export function PdfPreviewCard({ title, status, errorMessage, drive, viewButton }: Props) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-content-center rounded-xl bg-muted">
          {status === "loading" ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : status === "error" ? (
            <AlertCircle className="h-6 w-6 text-destructive" />
          ) : (
            <FileText className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="font-semibold">{title}</div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {status === "loading" && <span>PDF wird erzeugt …</span>}
            {status === "error" && (
              <span className="text-destructive">{errorMessage || "PDF konnte nicht erzeugt werden"}</span>
            )}
            {status === "ready" && <span>PDF bereit</span>}
            <DriveStatusBadge drive={drive} />
          </div>
        </div>
        <div className="shrink-0">{viewButton}</div>
      </div>
    </div>
  );
}
