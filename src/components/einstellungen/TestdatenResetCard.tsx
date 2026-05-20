// Einmaliger Testdaten-Reset (Gefahrenzone).
// Sichtbar nur solange der Sentinel im Backend nicht gesetzt ist.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";

const CONFIRM_PHRASE = "ALLES LÖSCHEN";

type Status = { verfuegbar: boolean; genutztAm: string | null };
type ResetResult = {
  geloescht: {
    kunden: number;
    angebote: number;
    rechnungen: number;
    protokolle: number;
    dokumente: number;
  };
};

export function TestdatenResetCard() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [passwort, setPasswort] = useState("");

  const status = useQuery<Status>({
    queryKey: ["testdaten-reset", "status"],
    queryFn: () => api.get<Status>("/testdaten-reset/status"),
  });

  const reset = useMutation({
    mutationFn: () =>
      api.post<ResetResult>("/testdaten-reset", {
        passwort,
        bestaetigung: confirm,
      }),
    onSuccess: (data) => {
      const g = data.geloescht;
      toast.success(
        `Testdaten gelöscht: ${g.kunden} Kunden, ${g.angebote} Angebote, ${g.rechnungen} Rechnungen, ${g.protokolle} Protokolle, ${g.dokumente} Dokumente.`,
      );
      setOpen(false);
      setConfirm("");
      setPasswort("");
      void qc.invalidateQueries();
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : "Reset fehlgeschlagen";
      toast.error(msg);
    },
  });

  if (status.isLoading) return null;

  const verfuegbar = status.data?.verfuegbar ?? false;
  const genutztAm = status.data?.genutztAm ?? null;

  return (
    <div className="rounded-2xl border border-destructive/40 bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div>
          <h3 className="text-base font-semibold text-foreground">Testdaten löschen</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Entfernt unwiderruflich alle Kunden, Angebote, Rechnungen, Protokolle
            und zugehörigen Dokumente. Firmendaten, E-Mail-Vorlagen, Backups,
            Steuern und Zugang bleiben erhalten.
          </p>
        </div>
      </div>

      {verfuegbar ? (
        <>
          <ul className="mb-4 ml-8 list-disc space-y-0.5 text-sm text-muted-foreground">
            <li>Alle Kunden, Objekte und Ansprechpartner</li>
            <li>Alle Angebote, Rechnungen, Zahlungen und Mahnungen</li>
            <li>Alle Protokolle und hochgeladenen Dokumente</li>
            <li>Belegnummern-Zähler werden zurückgesetzt</li>
          </ul>
          <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            Vor dem Löschen wird automatisch ein vollständiges Sicherheits-Backup
            erstellt. Diese Funktion kann <strong>nur ein einziges Mal</strong>{" "}
            ausgeführt werden und ist danach dauerhaft deaktiviert.
          </div>
          <Button variant="destructive" onClick={() => setOpen(true)}>
            Testdaten löschen…
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Testdaten-Reset wurde bereits am{" "}
          {genutztAm
            ? new Date(genutztAm + (genutztAm.endsWith("Z") ? "" : "Z")).toLocaleString("de-DE")
            : "—"}{" "}
          verwendet. Die Funktion ist dauerhaft deaktiviert.
        </p>
      )}

      <AlertDialog open={open} onOpenChange={(v) => !reset.isPending && setOpen(v)}>
        <AlertDialogContent className="bg-background">
          <AlertDialogHeader>
            <AlertDialogTitle>Testdaten endgültig löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion ist unwiderruflich. Vorher wird automatisch ein
              Sicherheits-Backup erstellt. Nach dem Löschen ist diese Funktion
              dauerhaft deaktiviert.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Bestätigung — tippe exakt: <code className="rounded bg-muted px-1">{CONFIRM_PHRASE}</code>
              </Label>
              <Input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={CONFIRM_PHRASE}
                autoComplete="off"
                disabled={reset.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Dein Passwort</Label>
              <Input
                type="password"
                value={passwort}
                onChange={(e) => setPasswort(e.target.value)}
                autoComplete="current-password"
                disabled={reset.isPending}
              />
            </div>
          </div>

          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={reset.isPending}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => reset.mutate()}
              disabled={
                reset.isPending ||
                confirm !== CONFIRM_PHRASE ||
                passwort.length === 0
              }
            >
              {reset.isPending ? "Wird gelöscht…" : "Endgültig löschen"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
