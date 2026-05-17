// Lösch-Dialog für Angebote und Rechnungen.
// Einheitlicher Soft-Delete: ein Schritt, keine Force-/Endgültig-Option.
// Wiederherstellung erfolgt in Einstellungen → Datenbank.

import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDeleteAngebot, useDeleteRechnung } from "@/hooks/useApi";

interface Props {
  art: "angebot" | "rechnung";
  id: string;
  nummer: string;
  /** Wird nicht mehr ausgewertet — Lösch-Pfad ist einheitlich soft. */
  status?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (mode: "soft" | "hard") => void;
}

export function BelegLoeschenDialog({
  art,
  id,
  nummer,
  open,
  onOpenChange,
  onDeleted,
}: Props) {
  const delAngebot = useDeleteAngebot();
  const delRechnung = useDeleteRechnung();
  const isPending = delAngebot.isPending || delRechnung.isPending;
  const label = art === "angebot" ? "Angebot" : "Rechnung";

  function handleDelete() {
    const mutation = art === "angebot" ? delAngebot : delRechnung;
    mutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast.success(
            `${label} ${nummer} gelöscht. Wiederherstellbar in Einstellungen → Datenbank.`,
          );
          onOpenChange(false);
          onDeleted?.("soft");
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Löschen fehlgeschlagen"),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {label} löschen
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono text-foreground">{nummer}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Das {label.toLowerCase()} wird gelöscht und aus den Listen entfernt.
            Es kann jederzeit unter <span className="font-medium text-foreground">Einstellungen → Datenbank</span> wiederhergestellt werden.
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button variant="destructive" disabled={isPending} onClick={handleDelete}>
              {isPending ? "Lösche…" : "Löschen"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}