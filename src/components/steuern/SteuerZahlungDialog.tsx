// Dialog zur manuellen Erfassung einer Steuerzahlung.
// Steuerart + Zeitraum + Betrag + Datum (+ optionale Notiz) → Posten als bezahlt markiert.

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { todayISO, formatEUR, formatDate } from "@/lib/format";
import { toast } from "sonner";
import type { SteuerArt, SteuerPosten } from "@/lib/steuern/types";
import type { BezahltMarkierung } from "@/lib/steuern/store";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Alle aktuell generierten + manuell überlagerten Posten (für Vorauswahl & Beträge). */
  posten: SteuerPosten[];
  onSpeichern: (postenId: string, eintrag: BezahltMarkierung) => void;
}

const ART_OPTIONEN: Array<{ value: Exclude<SteuerArt, "manuell">; label: string }> = [
  { value: "ust", label: "Umsatzsteuer" },
  { value: "kst", label: "Körperschaftsteuer" },
  { value: "soli", label: "Solidaritätszuschlag" },
  { value: "gewst", label: "Gewerbesteuer" },
];

function parseEUInput(s: string): number {
  const cleaned = s.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

const eingabeSchema = z.object({
  art: z.enum(["ust", "kst", "soli", "gewst"]),
  postenId: z.string().min(1, "Zeitraum wählen"),
  betrag: z.number().positive("Betrag muss größer als 0 sein").max(999_999_999, "Betrag zu groß"),
  datum: z.string().refine((d) => {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return false;
    const max = new Date();
    max.setDate(max.getDate() + 30);
    return dt <= max;
  }, "Datum darf maximal 30 Tage in der Zukunft liegen"),
  notiz: z.string().max(200, "Notiz max. 200 Zeichen").optional(),
});

export function SteuerZahlungDialog({ open, onOpenChange, posten, onSpeichern }: Props) {
  const [art, setArt] = useState<Exclude<SteuerArt, "manuell">>("ust");
  const [postenId, setPostenId] = useState<string>("");
  const [betragStr, setBetragStr] = useState<string>("");
  const [datum, setDatum] = useState<string>(todayISO());
  const [notiz, setNotiz] = useState<string>("");

  // Posten der gewählten Art, sortiert: offene zuerst (fälligste oben), dann bereits bezahlte
  const passendePosten = useMemo(() => {
    return posten
      .filter((p) => p.art === art)
      .sort((a, b) => {
        const aOffen = a.status !== "bezahlt";
        const bOffen = b.status !== "bezahlt";
        if (aOffen !== bOffen) return aOffen ? -1 : 1;
        return a.faelligAm.localeCompare(b.faelligAm);
      });
  }, [posten, art]);

  // Wenn Art wechselt: ersten offenen Posten vorauswählen + dessen Betrag setzen
  useEffect(() => {
    if (!open) return;
    const ersterOffener = passendePosten.find((p) => p.status !== "bezahlt") ?? passendePosten[0];
    if (ersterOffener) {
      setPostenId(ersterOffener.id);
      setBetragStr(ersterOffener.geschaetzterBetrag.toFixed(2).replace(".", ","));
    } else {
      setPostenId("");
      setBetragStr("");
    }
  }, [art, open, passendePosten]);

  // Wenn Posten manuell gewechselt wird: Betrag aus dem Posten übernehmen
  function handlePostenChange(id: string) {
    setPostenId(id);
    const p = passendePosten.find((x) => x.id === id);
    if (p) {
      setBetragStr(p.geschaetzterBetrag.toFixed(2).replace(".", ","));
    }
  }

  // Reset bei Öffnen
  useEffect(() => {
    if (open) {
      setArt("ust");
      setDatum(todayISO());
      setNotiz("");
    }
  }, [open]);

  function handleSpeichern() {
    const betrag = parseEUInput(betragStr);
    const result = eingabeSchema.safeParse({ art, postenId, betrag, datum, notiz: notiz.trim() || undefined });
    if (!result.success) {
      toast.error(result.error.issues[0]?.message ?? "Eingabe ungültig");
      return;
    }
    onSpeichern(postenId, {
      bezahltAm: datum,
      tatsaechlicherBetrag: betrag,
      notiz: notiz.trim() || undefined,
    });
    toast.success("Zahlung erfasst");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background">
        <DialogHeader>
          <DialogTitle>Steuerzahlung erfassen</DialogTitle>
          <DialogDescription>
            Was wurde wann ans Finanzamt überwiesen? Wird vom „Empfohlene Rücklage"-Betrag abgezogen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Steuerart */}
          <div className="space-y-1.5">
            <Label>Welche Steuer</Label>
            <Select value={art} onValueChange={(v) => setArt(v as Exclude<SteuerArt, "manuell">)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ART_OPTIONEN.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Zeitraum */}
          <div className="space-y-1.5">
            <Label>Zeitraum</Label>
            {passendePosten.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                Keine berechneten Posten dieser Art für {new Date().getFullYear()}. Es liegen noch keine
                Rechnungen oder Belege im System vor, aus denen sich diese Steuer ableiten ließe.
              </p>
            ) : (
              <Select value={postenId} onValueChange={handlePostenChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Zeitraum wählen" />
                </SelectTrigger>
                <SelectContent>
                  {passendePosten.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <span>{p.titel}</span>
                        {p.status === "bezahlt" && (
                          <span className="text-xs text-success">· bereits erfasst</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {postenId && (() => {
              const p = passendePosten.find((x) => x.id === postenId);
              return p ? (
                <p className="text-xs text-muted-foreground">
                  Geschätzter Betrag: {formatEUR(p.geschaetzterBetrag)} · Fällig {formatDate(p.faelligAm)}
                </p>
              ) : null;
            })()}
          </div>

          {/* Betrag + Datum nebeneinander */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="zahl-betrag">Bezahlter Betrag</Label>
              <div className="relative">
                <Input
                  id="zahl-betrag"
                  type="text"
                  inputMode="decimal"
                  value={betragStr}
                  onChange={(e) => setBetragStr(e.target.value)}
                  placeholder="0,00"
                  className="pr-8"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  €
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zahl-datum">Datum</Label>
              <Input
                id="zahl-datum"
                type="date"
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
              />
            </div>
          </div>

          {/* Notiz */}
          <div className="space-y-1.5">
            <Label htmlFor="zahl-notiz">Notiz (optional)</Label>
            <Textarea
              id="zahl-notiz"
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              placeholder="z. B. „Bescheid vom 12.05., Lastschrift"
              rows={2}
              maxLength={200}
            />
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSpeichern} disabled={!postenId}>
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
