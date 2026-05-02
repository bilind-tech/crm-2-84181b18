// Sicherheits-Dialog für Backup-Wiederherstellung.
// Zwei Schritte: Warnung lesen → Bestätigungswort eintippen → Restore.
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import type { BackupEintrag } from "@/lib/api/types";

const BESTAETIGUNG = "WIEDERHERSTELLEN";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RestoreBackupDialog({
  backup,
  open,
  isUploadRestore,
  onClose,
  onConfirm,
}: {
  backup: BackupEintrag;
  open: boolean;
  isUploadRestore?: boolean;
  onClose: () => void;
  onConfirm: (b: BackupEintrag) => Promise<void>;
}) {
  const [eingabe, setEingabe] = useState("");
  const [busy, setBusy] = useState(false);
  const matches = eingabe.trim().toUpperCase() === BESTAETIGUNG;

  const handle = async () => {
    setBusy(true);
    try {
      await onConfirm(backup);
      setEingabe("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            Backup wiederherstellen?
          </DialogTitle>
          <DialogDescription className="space-y-2 pt-2 text-sm text-foreground">
            <span className="block">
              {isUploadRestore
                ? "Du wirst alle Daten mit der hochgeladenen Datei überschreiben."
                : "Du wirst alle Daten auf den Stand vom"}{" "}
              {!isUploadRestore && (
                <strong>{formatDateTime(backup.abgeschlossenAm ?? backup.zeitpunktStart)}</strong>
              )}
              {!isUploadRestore && " zurücksetzen."}
            </span>
            <span className="block text-destructive">
              ALLE Änderungen seit diesem Backup gehen verloren.
            </span>
            <span className="block text-muted-foreground">
              Es wird automatisch ein Sicherheitsbackup vor der Wiederherstellung erstellt.
              Du kannst danach jederzeit dorthin zurück.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <p className="text-sm">
            Tippe <code className="rounded bg-muted px-1 py-0.5 text-xs font-bold">{BESTAETIGUNG}</code>{" "}
            zur Bestätigung:
          </p>
          <Input
            autoFocus
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
            placeholder={BESTAETIGUNG}
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches) handle();
            }}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button variant="destructive" onClick={handle} disabled={!matches || busy}>
            {busy ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-1.5 h-4 w-4" />
            )}
            Ja, wiederherstellen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
