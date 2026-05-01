import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAddZahlung } from "@/hooks/useApi";
import { formatEUR, todayISO } from "@/lib/format";
import type { Rechnung, Zahlungsmethode } from "@/lib/api/types";
import { summenRechnung } from "@/lib/mock/backend";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rechnung: Rechnung;
}

const METHODEN: { value: Zahlungsmethode; label: string }[] = [
  { value: "ueberweisung", label: "Überweisung" },
  { value: "bar", label: "Bar" },
  { value: "karte", label: "Karte" },
  { value: "paypal", label: "PayPal" },
  { value: "sepa", label: "SEPA-Lastschrift" },
  { value: "sonstiges", label: "Sonstiges" },
];

function parseEUInput(s: string): number {
  // akzeptiert "150,50" oder "150.50"
  const cleaned = s.replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

export function ZahlungErfassenDialog({ open, onOpenChange, rechnung }: Props) {
  const summe = useMemo(
    () => summenRechnung(rechnung.positionen, rechnung.rabattGesamt),
    [rechnung]
  );
  const bezahlt = rechnung.zahlungen.reduce((a, z) => a + z.betrag, 0);
  const offen = Math.max(0, summe.brutto - bezahlt);

  const [betragStr, setBetragStr] = useState(offen.toFixed(2).replace(".", ","));
  const [datum, setDatum] = useState(todayISO());
  const [methode, setMethode] = useState<Zahlungsmethode>("ueberweisung");
  const [notiz, setNotiz] = useState("");

  // Reset bei (Wieder-)Öffnen
  useEffect(() => {
    if (open) {
      setBetragStr(offen.toFixed(2).replace(".", ","));
      setDatum(todayISO());
      setMethode("ueberweisung");
      setNotiz("");
    }
  }, [open, offen]);

  const add = useAddZahlung(rechnung.id);
  const betrag = parseEUInput(betragStr);
  const restNach = Math.max(0, offen - betrag);

  function setQuick(value: number) {
    setBetragStr(value.toFixed(2).replace(".", ","));
  }

  async function submit() {
    if (betrag <= 0) {
      toast.error("Bitte einen Betrag größer 0 eingeben");
      return;
    }
    if (betrag > offen + 0.001) {
      toast.error(`Betrag darf höchstens ${formatEUR(offen)} sein`);
      return;
    }
    await add.mutateAsync({
      datum,
      betrag,
      methode,
      notiz: notiz.trim() || undefined,
    });
    toast.success(`${formatEUR(betrag)} als Zahlung erfasst`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background">
        <DialogHeader>
          <DialogTitle>Zahlung erfassen</DialogTitle>
          <DialogDescription>
            Rechnung <span className="font-mono">{rechnung.nummer}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Offen-Übersicht */}
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Offener Betrag</p>
          <p className="mt-1 text-2xl font-bold text-primary">{formatEUR(offen)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            von {formatEUR(summe.brutto)} gesamt
            {bezahlt > 0 && ` · bereits ${formatEUR(bezahlt)} bezahlt`}
          </p>
        </div>

        {/* Schnell-Buttons */}
        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setQuick(offen)}
          >
            Voll
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setQuick(offen / 2)}
          >
            Hälfte
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setQuick(offen / 4)}
          >
            Viertel
          </Button>
        </div>

        {/* Betrag */}
        <div>
          <Label htmlFor="betrag" className="text-xs font-medium text-muted-foreground">
            Betrag (€)
          </Label>
          <Input
            id="betrag"
            type="text"
            inputMode="decimal"
            value={betragStr}
            onChange={(e) => setBetragStr(e.target.value)}
            className="mt-1.5 h-12 text-lg font-semibold"
            autoFocus
          />
          {betrag > 0 && betrag <= offen && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Nach dieser Zahlung noch offen:{" "}
              <span className="font-semibold text-foreground">{formatEUR(restNach)}</span>
              {restNach <= 0.001 && " · Rechnung wird vollständig bezahlt"}
            </p>
          )}
        </div>

        {/* Datum + Methode */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="datum" className="text-xs font-medium text-muted-foreground">
              Datum
            </Label>
            <Input
              id="datum"
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className="mt-1.5 h-10"
            />
          </div>
          <div>
            <Label htmlFor="methode" className="text-xs font-medium text-muted-foreground">
              Methode
            </Label>
            <select
              id="methode"
              value={methode}
              onChange={(e) => setMethode(e.target.value as Zahlungsmethode)}
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {METHODEN.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Notiz */}
        <div>
          <Label htmlFor="notiz" className="text-xs font-medium text-muted-foreground">
            Notiz (optional)
          </Label>
          <Textarea
            id="notiz"
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            placeholder="z. B. Verwendungszweck, Buchungsreferenz …"
            className="mt-1.5 min-h-[60px]"
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={add.isPending || betrag <= 0}>
            {add.isPending ? "Speichere…" : "Zahlung speichern"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
