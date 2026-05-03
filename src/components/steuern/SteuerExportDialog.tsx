// Dialog: Steuer-Daten als ZIP exportieren (für Steuerberater).
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRechnungen, useDokumente, useKunden } from "@/hooks/useApi";
import { useSteuerEinstellungen } from "@/lib/steuern/store";
import { buildSteuerExport, downloadBlob } from "@/lib/steuern/export";
import { toast } from "sonner";
import type { UstRhythmus } from "@/lib/steuern/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultJahr: number;
}

export function SteuerExportDialog({ open, onOpenChange, defaultJahr }: Props) {
  const { data: rechnungen = [] } = useRechnungen();
  const { data: dokumente = [] } = useDokumente();
  const { data: kunden = [] } = useKunden();
  const { data: einstellungen } = useSteuerEinstellungen();
  const [jahr, setJahr] = useState(String(defaultJahr));
  const [rhythmus, setRhythmus] = useState<UstRhythmus>(einstellungen.ustRhythmus);
  const [busy, setBusy] = useState(false);

  const aktuellesJahr = new Date().getFullYear();
  const jahre = [aktuellesJahr - 2, aktuellesJahr - 1, aktuellesJahr];

  async function handleExport() {
    setBusy(true);
    try {
      const blob = await buildSteuerExport({
        jahr: Number(jahr),
        rhythmus,
        rechnungen,
        dokumente,
        kunden,
      });
      downloadBlob(blob, `steuer-export-${jahr}.zip`);
      toast.success(`Export ${jahr} heruntergeladen`);
      onOpenChange(false);
    } catch (e) {
      toast.error("Export fehlgeschlagen");
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background">
        <DialogHeader>
          <DialogTitle>Export für Steuerberater</DialogTitle>
          <DialogDescription>
            ZIP mit Einnahmen, Ausgaben, USt-Übersicht und Gewinn als CSV.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Jahr</Label>
            <Select value={jahr} onValueChange={setJahr}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {jahre.map((j) => (
                  <SelectItem key={j} value={String(j)}>{j}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>USt-Periode</Label>
            <Select value={rhythmus} onValueChange={(v) => setRhythmus(v as UstRhythmus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monatlich">Monatlich</SelectItem>
                <SelectItem value="quartalsweise">Quartalsweise</SelectItem>
                <SelectItem value="jaehrlich">Jährlich</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Abbrechen
          </Button>
          <Button onClick={handleExport} disabled={busy}>
            {busy ? "Erstelle ZIP…" : "ZIP herunterladen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
