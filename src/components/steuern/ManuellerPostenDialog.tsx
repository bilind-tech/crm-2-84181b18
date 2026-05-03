// Dialog zum Anlegen eines manuellen Steuer-Termins (Grundsteuer, Kfz, IHK, etc.)

import { useEffect, useState } from "react";
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
import { useManuellePosten } from "@/lib/steuern/store";
import type { SteuerPosten } from "@/lib/steuern/types";
import { todayISO } from "@/lib/format";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Wenn gesetzt → Edit-Modus statt Anlegen. */
  editPosten?: SteuerPosten;
}

export function ManuellerPostenDialog({ open, onOpenChange, editPosten }: Props) {
  const { add, update } = useManuellePosten();
  const [titel, setTitel] = useState("");
  const [betragStr, setBetragStr] = useState("");
  const [faelligAm, setFaelligAm] = useState("");
  const [notiz, setNotiz] = useState("");

  useEffect(() => {
    if (open && editPosten) {
      setTitel(editPosten.titel);
      setBetragStr(String(editPosten.geschaetzterBetrag).replace(".", ","));
      setFaelligAm(editPosten.faelligAm);
      setNotiz(editPosten.notiz ?? "");
    } else if (open && !editPosten) {
      setTitel("");
      setBetragStr("");
      setFaelligAm("");
      setNotiz("");
    }
  }, [open, editPosten]);

  function reset() {
    setTitel("");
    setBetragStr("");
    setFaelligAm("");
    setNotiz("");
  }

  function handleSpeichern() {
    if (!titel.trim() || !faelligAm) {
      toast.error("Titel und Fälligkeit sind Pflicht.");
      return;
    }
    const betrag = parseFloat(betragStr.replace(",", ".")) || 0;
    if (editPosten) {
      update(editPosten.id, {
        titel: titel.trim(),
        zeitraum: { jahr: new Date(faelligAm).getFullYear() },
        faelligAm,
        geschaetzterBetrag: betrag,
        notiz: notiz.trim() || undefined,
      });
      toast.success("Termin aktualisiert");
    } else {
      add({
        art: "manuell",
        titel: titel.trim(),
        zeitraum: { jahr: new Date(faelligAm).getFullYear() },
        faelligAm,
        geschaetzterBetrag: betrag,
        status: "offen",
        notiz: notiz.trim() || undefined,
      });
      toast.success("Steuer-Termin angelegt");
    }
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-md bg-background">
        <DialogHeader>
          <DialogTitle>{editPosten ? "Steuer-Termin bearbeiten" : "Steuer-Termin anlegen"}</DialogTitle>
          <DialogDescription>
            Für alles, was nicht automatisch berechnet wird (Grundsteuer, Kfz, IHK, Berufsgenossenschaft, Rundfunk …).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="titel">Titel</Label>
            <Input
              id="titel"
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              placeholder="z.B. IHK-Beitrag 2026"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="faellig">Fällig am</Label>
              <Input
                id="faellig"
                type="date"
                value={faelligAm}
                /* Vergangene Termine erlaubt im Edit-Modus */
                onChange={(e) => setFaelligAm(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="betrag">Geschätzter Betrag</Label>
              <Input
                id="betrag"
                type="text"
                inputMode="decimal"
                value={betragStr}
                onChange={(e) => setBetragStr(e.target.value)}
                placeholder="0,00 €"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notiz">Notiz (optional)</Label>
            <Textarea
              id="notiz"
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              placeholder="z.B. „Bescheid liegt im Ordner / Kontakt: …"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSpeichern}>{editPosten ? "Speichern" : "Anlegen"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
