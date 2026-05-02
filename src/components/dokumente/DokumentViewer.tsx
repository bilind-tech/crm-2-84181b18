import { Link } from "@tanstack/react-router";
import { Download, Pencil, FileText, ExternalLink, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useKunde, useObjekt } from "@/hooks/useApi";
import { useDokumentBlobUrl } from "@/hooks/useDokumentBlobUrl";
import type { Dokument } from "@/lib/api/types";
import { DriveSyncRow } from "./DriveSyncBadge";

interface Props {
  dokument: Dokument | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEdit: (d: Dokument) => void;
}

export function DokumentViewer({ dokument, open, onOpenChange, onEdit }: Props) {
  const { data: kunde } = useKunde(dokument?.kundeId ?? "");
  const { data: objekt } = useObjekt(dokument?.objektId ?? "");
  const { url: dateiUrl, loading } = useDokumentBlobUrl(dokument);

  if (!dokument) return null;

  function handleDownload() {
    if (!dateiUrl) return;
    const a = document.createElement("a");
    a.href = dateiUrl;
    a.download = dokument!.dateiname || dokument!.titel;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const isImage = dokument.mimeType.startsWith("image/");
  const isPdf = dokument.mimeType === "application/pdf";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none border-0 bg-background p-0 sm:h-[92vh] sm:w-[min(96vw,1100px)] sm:rounded-2xl sm:border"
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-3 pr-12 sm:px-5 sm:pr-14">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold sm:text-base">{dokument.titel}</p>
            <p className="truncate text-xs text-muted-foreground">{dokument.dateiname}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="rounded-lg"
            aria-label="Herunterladen"
          >
            <Download className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Download</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onEdit(dokument);
            }}
            className="rounded-lg"
            aria-label="Bearbeiten"
          >
            <Pencil className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Bearbeiten</span>
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto bg-muted/30">
          {loading && !dateiUrl ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Lade Datei…
            </div>
          ) : isImage && dateiUrl ? (
            <div className="flex min-h-full items-center justify-center p-4">
              <img
                src={dateiUrl}
                alt={dokument.titel}
                className="max-h-full max-w-full object-contain"
                style={{ touchAction: "pinch-zoom" }}
              />
            </div>
          ) : isPdf && dateiUrl ? (
            <iframe
              src={dateiUrl}
              title={dokument.titel}
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <FileText className="h-8 w-8" />
              </div>
              <div>
                <p className="font-semibold">Vorschau nicht verfügbar</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Diese Datei ({dokument.mimeType}) kann im Browser nicht angezeigt werden.
                </p>
              </div>
              {dateiUrl && (
                <div className="flex gap-2">
                  <Button onClick={handleDownload}>
                    <Download className="mr-1.5 h-4 w-4" /> Herunterladen
                  </Button>
                  <Button variant="outline" asChild>
                    <a href={dateiUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-1.5 h-4 w-4" /> Im neuen Tab öffnen
                    </a>
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 border-t border-border bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {kunde ? (
              <Link
                to="/kunden/$id"
                params={{ id: kunde.id }}
                className="text-primary hover:underline"
                onClick={() => onOpenChange(false)}
              >
                {kunde.firmenname || `${kunde.vorname ?? ""} ${kunde.nachname ?? ""}`.trim() || "Kunde"}
              </Link>
            ) : (
              <span className="text-muted-foreground">Kein Kunde verknüpft</span>
            )}
            {objekt && (
              <>
                <span className="text-muted-foreground">·</span>
                <Link
                  to="/objekte/$id"
                  params={{ id: objekt.id }}
                  className="text-primary hover:underline"
                  onClick={() => onOpenChange(false)}
                >
                  {objekt.name}
                </Link>
              </>
            )}
          </div>
          <DriveSyncRow dokument={dokument} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
