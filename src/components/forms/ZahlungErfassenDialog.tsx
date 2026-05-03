import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAddZahlung } from "@/hooks/useApi";
import { formatEUR, todayISO } from "@/lib/format";
import type { Rechnung } from "@/lib/api/types";
import { summenRechnung } from "@/lib/belege/summen";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rechnung: Rechnung;
}

function parseEUInput(s: string): number {
  const cleaned = s.replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

type Stufe = "frage" | "teil";

export function ZahlungErfassenDialog({ open, onOpenChange, rechnung }: Props) {
  const summe = useMemo(
    () => summenRechnung(rechnung.positionen, rechnung.rabattGesamt),
    [rechnung],
  );
  const bezahlt = rechnung.zahlungen.reduce((a, z) => a + z.betrag, 0);
  const offen = Math.max(0, summe.brutto - bezahlt);

  const [stufe, setStufe] = useState<Stufe>("frage");
  const [betragStr, setBetragStr] = useState("");

  useEffect(() => {
    if (open) {
      setStufe("frage");
      setBetragStr("");
    }
  }, [open]);

  const add = useAddZahlung(rechnung.id);
  const betrag = parseEUInput(betragStr);
  const teilUngueltig = betrag <= 0 || betrag > offen + 0.001;

  async function buchen(value: number) {
    if (value <= 0) return;
    const clamped = Math.min(value, offen);
    await add.mutateAsync({
      datum: todayISO(),
      betrag: clamped,
      methode: "ueberweisung",
      notiz: undefined,
    });
    toast.success(`${formatEUR(clamped)} als bezahlt eingetragen`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm bg-background">
        {stufe === "frage" ? (
          <>
            <DialogHeader>
              <DialogTitle>Bezahlt?</DialogTitle>
              <DialogDescription>
                Rechnung <span className="font-mono">{rechnung.nummer}</span> · offen{" "}
                <span className="font-semibold text-foreground">{formatEUR(offen)}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 flex flex-col gap-2">
              <Button
                className="h-12 text-base"
                disabled={add.isPending || offen <= 0}
                onClick={() => buchen(offen)}
              >
                Ja, voll bezahlt ({formatEUR(offen)})
              </Button>
              <Button
                variant="outline"
                className="h-11"
                disabled={add.isPending}
                onClick={() => setStufe("teil")}
              >
                Nein, nur ein Teil
              </Button>
              <Button
                variant="ghost"
                className="h-10"
                disabled={add.isPending}
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
                Offen: <span className="font-semibold text-foreground">{formatEUR(offen)}</span>
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
              {betrag > 0 && betrag <= offen && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Danach noch offen:{" "}
                  <span className="font-semibold text-foreground">
                    {formatEUR(Math.max(0, offen - betrag))}
                  </span>
                </p>
              )}
              {betrag > offen + 0.001 && (
                <p className="mt-2 text-xs text-destructive">
                  Betrag darf höchstens {formatEUR(offen)} sein.
                </p>
              )}
            </div>

            <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                className="h-11"
                disabled={add.isPending}
                onClick={() => setStufe("frage")}
              >
                Zurück
              </Button>
              <Button
                className="h-11"
                disabled={add.isPending || teilUngueltig}
                onClick={() => buchen(betrag)}
              >
                {add.isPending ? "Speichere…" : "Speichern"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
