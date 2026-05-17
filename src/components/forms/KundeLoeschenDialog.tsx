// Zweistufiger Lösch-Dialog für Kunden.
// Stufe 1: Übersicht aller abhängigen Daten + ausdrückliche Warnung.
// Stufe 2: Tippe-zur-Bestätigung (Firmenname oder Nachname) — verhindert
// versehentliches Löschen. Erst dann wird der Löschen-Button aktiv.
//
// Hinweis: Das Backend kann mit 409 antworten, wenn referentielle Daten
// (z. B. nicht stornierte Rechnungen) das Löschen blockieren — Fehler wird
// als Toast gezeigt, der Dialog bleibt offen, damit der Nutzer reagieren kann.

import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useDeleteKunde } from "@/hooks/useApi";
import { errorToMessage } from "@/lib/api/piClient";
import type {
  Kunde,
  Ansprechpartner,
  Objekt,
  Angebot,
  Rechnung,
  Dokument,
} from "@/lib/api/types";

type KundeDetail = Omit<Kunde, "notizen"> & {
  ansprechpartner?: Ansprechpartner[];
  objekte?: Objekt[];
  angebote?: Angebot[];
  rechnungen?: Rechnung[];
  dokumente?: Dokument[];
  notizen?: unknown[] | string;
};

interface Props {
  kunde: KundeDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KundeLoeschenDialog({ kunde, open, onOpenChange }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [eingabe, setEingabe] = useState("");
  const [force, setForce] = useState(true);
  const del = useDeleteKunde();
  const navigate = useNavigate();

  const fullName =
    kunde.firmenname || `${kunde.vorname ?? ""} ${kunde.nachname ?? ""}`.trim() || kunde.nummer;
  const expected = fullName.trim();
  const matches = eingabe.trim().toLowerCase() === expected.toLowerCase();

  const counts = {
    objekte: Array.isArray(kunde.objekte) ? kunde.objekte.length : 0,
    angebote: Array.isArray(kunde.angebote) ? kunde.angebote.length : 0,
    rechnungen: Array.isArray(kunde.rechnungen) ? kunde.rechnungen.length : 0,
    ansprechpartner: Array.isArray(kunde.ansprechpartner) ? kunde.ansprechpartner.length : 0,
    dokumente: Array.isArray(kunde.dokumente) ? kunde.dokumente.length : 0,
    notizen: Array.isArray(kunde.notizen) ? kunde.notizen.length : 0,
  };
  const hatDaten =
    counts.objekte + counts.angebote + counts.rechnungen + counts.dokumente + counts.notizen > 0;

  function reset() {
    setStep(1);
    setEingabe("");
    setForce(true);
  }

  function handleOpenChange(o: boolean) {
    if (!o) reset();
    onOpenChange(o);
  }

  function handleDelete() {
    del.mutate(
      { id: kunde.id, force },
      {
      onSuccess: () => {
        toast.success(
          force
            ? `Kunde „${fullName}“ endgültig gelöscht`
            : `Kunde „${fullName}“ archiviert`,
        );
        handleOpenChange(false);
        navigate({ to: "/kunden" });
      },
        onError: (e) => toast.error(errorToMessage(e, "Löschen fehlgeschlagen")),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Kunde löschen
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{fullName}</span>{" "}
            <span className="font-mono text-xs">({kunde.nummer})</span>
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Diese Aktion ist <strong className="text-foreground">endgültig</strong> und kann nicht
              rückgängig gemacht werden.
            </p>
            {hatDaten ? (
              <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm">
                <p className="mb-2 font-medium">Folgende Daten werden mitgelöscht:</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {counts.objekte > 0 && <li>· {counts.objekte} Objekt(e)</li>}
                  {counts.ansprechpartner > 0 && (
                    <li>· {counts.ansprechpartner} Ansprechpartner</li>
                  )}
                  {counts.angebote > 0 && <li>· {counts.angebote} Angebot(e)</li>}
                  {counts.rechnungen > 0 && (
                    <li>· {counts.rechnungen} Rechnung(en) inkl. Zahlungen</li>
                  )}
                  {counts.dokumente > 0 && <li>· {counts.dokumente} Belege/Dokumente</li>}
                  {counts.notizen > 0 && <li>· {counts.notizen} Notiz(en)</li>}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Es sind keine weiteren Daten mit diesem Kunden verknüpft.
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Abbrechen
              </Button>
              <Button variant="destructive" onClick={() => setStep(2)}>
                Weiter
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bestaetigung">
                Tippe <span className="font-mono font-semibold">{expected}</span> zur Bestätigung
              </Label>
              <Input
                id="bestaetigung"
                value={eingabe}
                onChange={(e) => setEingabe(e.target.value)}
                placeholder={expected}
                autoFocus
              />
            </div>
            <Label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={force}
                onCheckedChange={(v) => setForce(v === true)}
                className="mt-0.5"
              />
              <span>
                Endgültig löschen inkl. aller Objekte, Angebote, Rechnungen, Zahlungen und Belege.
                Wenn abgewählt, wird der Kunde nur archiviert (auf inaktiv gesetzt).
              </span>
            </Label>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)}>
                Zurück
              </Button>
              <Button
                variant={force ? "destructive" : "secondary"}
                disabled={!matches || del.isPending}
                onClick={handleDelete}
              >
                {del.isPending
                  ? "Lösche…"
                  : force
                    ? "Endgültig löschen"
                    : "Archivieren"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
