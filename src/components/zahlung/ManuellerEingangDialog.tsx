// Dialog: Einzelnen Zahlungseingang manuell erfassen.

import { useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { todayISO } from "@/lib/format";
import { useCreateZahlungseingang } from "@/hooks/useZahlungseingaenge";

export function ManuellerEingangDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateZahlungseingang();
  const [datum, setDatum] = useState(todayISO());
  const [betrag, setBetrag] = useState<number>(0);
  const [zweck, setZweck] = useState("");
  const [sender, setSender] = useState("");
  const [iban, setIban] = useState("");

  const reset = () => {
    setDatum(todayISO());
    setBetrag(0);
    setZweck("");
    setSender("");
    setIban("");
  };

  const speichern = () => {
    if (betrag <= 0) {
      toast.error("Betrag muss größer als 0 sein.");
      return;
    }
    create.mutate(
      {
        buchungsdatum: datum,
        betrag,
        verwendungszweck: zweck.trim(),
        senderName: sender.trim() || undefined,
        senderIban: iban.trim() || undefined,
        importQuelle: "manuell",
      },
      {
        onSuccess: () => {
          toast.success("Zahlungseingang erfasst");
          reset();
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg bg-background">
        <DialogHeader>
          <DialogTitle>Zahlungseingang erfassen</DialogTitle>
          <DialogDescription>
            Manuelle Erfassung eines einzelnen Bank-Eingangs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Buchungsdatum</Label>
              <Input
                type="date"
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Betrag (€)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={betrag}
                onChange={(e) => setBetrag(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Verwendungszweck</Label>
            <Textarea
              value={zweck}
              onChange={(e) => setZweck(e.target.value)}
              placeholder="z. B. Rechnung 2026-0042"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Sender</Label>
              <Input
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                placeholder="optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">IBAN</Label>
              <Input
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                placeholder="optional"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">
            <X className="mr-1.5 h-4 w-4" /> Abbrechen
          </Button>
          <Button
            onClick={speichern}
            disabled={create.isPending}
            className="rounded-full"
          >
            <Check className="mr-1.5 h-4 w-4" /> Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
