// Recovery-Code neu erzeugen — Dialog. Aus dem alten UserMenu extrahiert.
import { useState } from "react";
import { toast } from "sonner";
import { piApi } from "@/lib/api/piClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function RecoveryRotateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [neuerCode, setNeuerCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function rotieren() {
    setFehler(null);
    setBusy(true);
    try {
      const res = await piApi.post<{ recoveryCode: string }>("/auth/recovery/regenerieren");
      setNeuerCode(res.recoveryCode);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setNeuerCode(null);
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neuen Recovery-Code erzeugen</DialogTitle>
          <DialogDescription>
            Der bisherige Recovery-Code wird damit ungültig. Notiere oder drucke den neuen Code
            sofort — er wird nur ein einziges Mal angezeigt.
          </DialogDescription>
        </DialogHeader>
        {!neuerCode ? (
          <>
            {fehler && (
              <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {fehler}
              </p>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Abbrechen
              </Button>
              <Button onClick={rotieren} disabled={busy}>
                {busy ? "Erzeuge …" : "Neuen Code erzeugen"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="rounded-md border border-border bg-muted/40 p-4 text-center font-mono text-base tracking-wider">
              {neuerCode}
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  void navigator.clipboard?.writeText(neuerCode);
                  toast.success("In Zwischenablage kopiert");
                }}
              >
                Kopieren
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => window.print()}>
                Drucken
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Fertig</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
