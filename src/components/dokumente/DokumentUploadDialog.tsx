// Dialog-Wrapper um das DokumentUploadPanel.
// Wird sowohl von "Dateien wählen"-Buttons als auch von der GlobalDropZone
// geöffnet. Pre-Files werden beim Öffnen automatisch in den Stapel gelegt.

import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  DokumentUploadPanel,
  type DokumentUploadPanelHandle,
} from "@/components/dokumente/DokumentUploadPanel";
import type { Dokument, DokumentTyp } from "@/lib/api/types";

export interface DokumentUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dateien, die beim Öffnen direkt in den Stapel geschoben werden. */
  initialFiles?: File[];
  kundeId?: string;
  objektId?: string;
  defaultTyp?: DokumentTyp;
  /** Überschrift abhängig vom Kontext. */
  title?: string;
  description?: string;
  onUploaded?: (docs: Dokument[]) => void;
}

export function DokumentUploadDialog({
  open,
  onOpenChange,
  initialFiles,
  kundeId,
  objektId,
  defaultTyp,
  title = "Dokumente hochladen",
  description,
  onUploaded,
}: DokumentUploadDialogProps) {
  const panelRef = useRef<DokumentUploadPanelHandle>(null);

  // Pre-Files in das Panel schieben, sobald es im DOM ist.
  useEffect(() => {
    if (!open) return;
    if (!initialFiles || initialFiles.length === 0) return;
    // Microtask, damit der Ref gesetzt ist
    const t = window.setTimeout(() => {
      panelRef.current?.addFiles(initialFiles);
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, initialFiles]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DokumentUploadPanel
          ref={panelRef}
          kundeId={kundeId}
          objektId={objektId}
          defaultMeta={{ typ: defaultTyp }}
          onUploaded={(docs) => {
            onUploaded?.(docs);
            // Dialog nicht automatisch schließen — User sieht Fertig-Status,
            // kann weitere Dateien hinzufügen oder bewusst schließen.
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
