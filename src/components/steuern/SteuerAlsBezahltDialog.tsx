// Zweistufiger Mini-Dialog "Steuer als bezahlt markieren".
// Stufe 1: Vorgeschlagener Betrag bestätigen — Ja / Anderer Betrag / Abbrechen.
// Stufe 2 (nur bei "Anderer Betrag"): nur ein Betragsfeld.
// Datum (heute) und Notiz (leer) werden automatisch gesetzt.

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { todayISO, formatEUR } from "@/lib/format";
import type { BezahltMarkierung } from "@/lib/steuern/store";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vorschlag: number;
  onSpeichern: (eintrag: BezahltMarkierung) => void;
}

export function SteuerAlsBezahltDialog({ open, onOpenChange, vorschlag, onSpeichern }: Props) {
  const [stufe, setStufe] = useState<1 | 2>(1);
  const [betragStr, setBetragStr] = useState("");

  function reset() {
    setStufe(1);
    setBetragStr("");
  }

  function handleClose(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  function bestaetigeVorschlag() {
    onSpeichern({ bezahltAm: todayISO(), tatsaechlicherBetrag: vorschlag });
    reset();
    onOpenChange(false);
  }

  function bestaetigeAnderer() {
    const betrag = parseFloat(betragStr.replace(",", ".")) || 0;
    onSpeichern({ bezahltAm: todayISO(), tatsaechlicherBetrag: betrag });
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm bg-background">
        {stufe === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle>Als bezahlt markieren</DialogTitle>
              <DialogDescription>
                Wurden {formatEUR(vorschlag)} so ans Finanzamt überwiesen?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button onClick={bestaetigeVorschlag} className="w-full">
                Ja, {formatEUR(vorschlag)}
              </Button>
              <Button variant="outline" onClick={() => setStufe(2)} className="w-full">
                Anderer Betrag
              </Button>
              <Button variant="ghost" onClick={() => handleClose(false)} className="w-full">
                Abbrechen
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Tatsächlicher Betrag</DialogTitle>
              <DialogDescription>Wie viel wurde überwiesen?</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="bz-betrag">Betrag</Label>
              <Input
                id="bz-betrag"
                type="text"
                inputMode="decimal"
                value={betragStr}
                onChange={(e) => setBetragStr(e.target.value)}
                placeholder="0,00 €"
                autoFocus
              />
            </div>
            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setStufe(1)}>
                Zurück
              </Button>
              <Button onClick={bestaetigeAnderer} disabled={!betragStr.trim()}>
                Speichern
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
