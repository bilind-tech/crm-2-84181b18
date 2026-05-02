// Window-weite Drop-Overlay für Datei-Uploads.
//
// Aktiv NUR auf:
//   /dokumente               → Upload ohne Vorgaben
//   /kunden/$id              → Upload mit Kunde vorgewählt
//   /objekte/$id             → Upload mit Kunde + Objekt vorgewählt
//
// Verhalten:
//  - Beim ersten dragenter auf dem Window erscheint ein semitransparentes
//    Overlay mit dezenter Anweisung. Das Overlay verschwindet bei dragleave
//    (window verlassen) oder nach dem Drop.
//  - Beim Drop öffnet sich das DokumentUploadDialog mit den Dateien
//    bereits im Stapel — der User kann zuweisen und dann "Alle hochladen".
//  - Drag innerhalb der Seite (z. B. Text markieren) wird ignoriert,
//    indem wir nur Events mit dataTransfer.types.includes("Files") behandeln.

import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { FileUp } from "lucide-react";
import { useObjekt } from "@/hooks/useApi";
import { DokumentUploadDialog } from "@/components/dokumente/DokumentUploadDialog";

function hasFiles(e: DragEvent): boolean {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
}

export function GlobalDropZone() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [over, setOver] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [files, setFiles] = useState<File[] | null>(null);

  // Pfad-Kontext bestimmen
  const isDokumente = pathname === "/dokumente";
  const kundeMatch = pathname.match(/^\/kunden\/([^/]+)$/);
  const objektMatch = pathname.match(/^\/objekte\/([^/]+)$/);
  const kundeId = kundeMatch?.[1];
  const objektId = objektMatch?.[1];

  // Wenn auf einer Objekt-Seite → Kunde aus Objekt nachladen
  const { data: objekt } = useObjekt(objektId ?? "");

  const aktiv = isDokumente || !!kundeId || !!objektId;

  useEffect(() => {
    if (!aktiv) return;
    let counter = 0;

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      counter += 1;
      setOver(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      counter = Math.max(0, counter - 1);
      if (counter === 0) setOver(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      counter = 0;
      setOver(false);
      const list = e.dataTransfer?.files;
      if (!list || list.length === 0) return;
      setFiles(Array.from(list));
      setDialogOpen(true);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [aktiv]);

  if (!aktiv) return null;

  // Vorbelegung
  const ctxKundeId = kundeId ?? objekt?.kundeId;
  const ctxObjektId = objektId;
  const titel = ctxObjektId
    ? "Dokumente zu diesem Objekt hochladen"
    : ctxKundeId
      ? "Dokumente zu diesem Kunden hochladen"
      : "Dokumente hochladen";
  const beschreibung = ctxObjektId || ctxKundeId
    ? "Werden automatisch dem aktuellen Kontext zugeordnet."
    : "Optional einem Kunden oder Objekt zuweisen — nicht verpflichtend.";

  return (
    <>
      {over && (
        <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-primary/10 backdrop-blur-sm">
          <div className="m-4 flex max-w-md flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-primary bg-background/95 px-8 py-10 text-center shadow-2xl">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FileUp className="h-7 w-7" />
            </div>
            <p className="text-lg font-semibold">Dateien hier ablegen</p>
            <p className="text-sm text-muted-foreground">
              {ctxObjektId
                ? "Werden diesem Objekt zugewiesen"
                : ctxKundeId
                  ? "Werden diesem Kunden zugewiesen"
                  : "Bilder oder PDF · bis 20 MB pro Datei"}
            </p>
          </div>
        </div>
      )}

      <DokumentUploadDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setFiles(null);
        }}
        initialFiles={files ?? undefined}
        kundeId={ctxKundeId}
        objektId={ctxObjektId}
        title={titel}
        description={beschreibung}
      />
    </>
  );
}
