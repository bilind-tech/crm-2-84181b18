import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateDauerauftrag } from "@/hooks/useDauerauftraege";
import type { Dauerauftrag, DauerauftragFrequenz } from "@/lib/api/types";

type Props = {
  da: Dauerauftrag;
  onClose: () => void;
};

/**
 * Geteilter Bearbeiten-Dialog für Daueraufträge — wird sowohl auf der
 * Rechnungs-Detailseite (DauerauftragVerwaltungCard) als auch im
 * „Aus Dauerauftrag"-Dialog der Rechnungs-Liste verwendet.
 *
 * Pausieren / Beenden erfolgt hier über das Status-Feld — bewusst kein
 * eigener destruktiver Button, damit man nichts „aus Versehen wegklickt".
 */
export function DauerauftragEditDialog({ da, onClose }: Props) {
  const update = useUpdateDauerauftrag(da.id);
  const [bezeichnung, setBezeichnung] = useState(da.bezeichnung);
  const [frequenz, setFrequenz] = useState<DauerauftragFrequenz>(da.frequenz);
  const [status, setStatus] = useState(da.status);
  const [steuersatz, setSteuersatz] = useState(da.steuersatz);
  const [rabattGesamt, setRabattGesamt] = useState(da.rabattGesamt);
  const [notizen, setNotizen] = useState(da.notizen ?? "");

  const save = () => {
    update.mutate(
      { bezeichnung, frequenz, status, steuersatz, rabattGesamt, notizen },
      {
        onSuccess: () => {
          toast.success("Dauerauftrag gespeichert");
          onClose();
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen"),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dauerauftrag bearbeiten</DialogTitle>
          <DialogDescription>{da.nummer}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Bezeichnung</Label>
            <Input value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Frequenz</Label>
              <select
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                value={frequenz}
                onChange={(e) => setFrequenz(e.target.value as DauerauftragFrequenz)}
              >
                <option value="monatlich">Monatlich</option>
                <option value="quartalsweise">Quartalsweise</option>
                <option value="halbjaehrlich">Halbjährlich</option>
                <option value="jaehrlich">Jährlich</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <select
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value as Dauerauftrag["status"])}
              >
                <option value="aktiv">Aktiv</option>
                <option value="pausiert">Pausiert</option>
                <option value="beendet">Beendet</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Steuersatz (%)</Label>
              <Input
                type="number"
                value={steuersatz}
                onChange={(e) => setSteuersatz(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label className="text-xs">Rabatt gesamt (%)</Label>
              <Input
                type="number"
                value={rabattGesamt}
                onChange={(e) => setRabattGesamt(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notizen</Label>
            <Input value={notizen} onChange={(e) => setNotizen(e.target.value)} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Positionen werden beim Bearbeiten der zugehörigen Rechnung gepflegt.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}