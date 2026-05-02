// Mini-Dialog im Stil des ZahlungErfassenDialog: erst Ja/Nein, dann optional Betrag.

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatEUR } from "@/lib/format";
import type { SteuerPosten } from "@/lib/steuern/types";

interface Props {
  posten: SteuerPosten | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (betrag: number | undefined) => void;
}

function parseEUInput(s: string): number {
  const cleaned = s.replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

type Stufe = "frage" | "betrag";

export function SteuerBezahltDialog({ posten, onOpenChange, onConfirm }: Props) {
  const [stufe, setStufe] = useState<Stufe>("frage");
  const [betragStr, setBetragStr] = useState("");
  const open = !!posten;

  useEffect(() => {
    if (open) {
      setStufe("frage");
      setBetragStr("");
    }
  }, [open]);

  if (!posten) return null;

  const geschaetzt = posten.geschaetzterBetrag;
  const betrag = parseEUInput(betragStr);
  const ungueltig = betrag <= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm bg-background">
        {stufe === "frage" ? (
          <>
            <DialogHeader>
              <DialogTitle>Bezahlt?</DialogTitle>
              <DialogDescription>
                {posten.titel} · geschätzt{" "}
                <span className="font-semibold text-foreground">{formatEUR(geschaetzt)}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 flex flex-col gap-2">
              <Button
                className="h-12 text-base"
                onClick={() => {
                  onConfirm(geschaetzt);
                  onOpenChange(false);
                }}
              >
                Ja, mit geschätztem Betrag ({formatEUR(geschaetzt)})
              </Button>
              <Button
                variant="outline"
                className="h-11"
                onClick={() => setStufe("betrag")}
              >
                Nein, anderer Betrag
              </Button>
              <Button
                variant="ghost"
                className="h-10"
                onClick={() => onOpenChange(false)}
              >
                Abbrechen
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Wie viel wurde bezahlt?</DialogTitle>
              <DialogDescription>
                Geschätzt: <span className="font-semibold text-foreground">{formatEUR(geschaetzt)}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2">
              <div className="relative">
                <Input
                  autoFocus
                  type="text"
                  inputMode="decimal"
                  value={betragStr}
                  onChange={(e) => setBetragStr(e.target.value)}
                  placeholder="0,00"
                  className="h-14 pr-10 text-2xl font-semibold"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-base text-muted-foreground">
                  €
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                className="h-11"
                onClick={() => setStufe("frage")}
              >
                Zurück
              </Button>
              <Button
                className="h-11"
                disabled={ungueltig}
                onClick={() => {
                  onConfirm(betrag);
                  onOpenChange(false);
                }}
              >
                Speichern
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
