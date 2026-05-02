// Dialog zum Bearbeiten eines Objekts.
// Felder identisch zum schlanken Anlage-Formular: Name, Nummer, Adresse, Status.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateObjekt } from "@/hooks/useApi";
import type { Objekt } from "@/lib/api/types";

interface Props {
  objekt: Objekt;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ObjektBearbeitenDialog({ objekt, open, onOpenChange }: Props) {
  const update = useUpdateObjekt(objekt.id);
  const [name, setName] = useState(objekt.name ?? "");
  const [nummer, setNummer] = useState(objekt.nummer ?? "");
  const [strasse, setStrasse] = useState(objekt.strasse ?? "");
  const [plz, setPlz] = useState(objekt.plz ?? "");
  const [ort, setOrt] = useState(objekt.ort ?? "");
  const [status, setStatus] = useState<Objekt["status"]>(objekt.status);

  useEffect(() => {
    if (open) {
      setName(objekt.name ?? "");
      setNummer(objekt.nummer ?? "");
      setStrasse(objekt.strasse ?? "");
      setPlz(objekt.plz ?? "");
      setOrt(objekt.ort ?? "");
      setStatus(objekt.status);
    }
  }, [open, objekt]);

  async function speichern() {
    if (!name.trim()) {
      toast.error("Name ist erforderlich");
      return;
    }
    await update.mutateAsync({
      name,
      nummer: nummer.trim() || undefined,
      strasse: strasse || undefined,
      plz: plz || undefined,
      ort: ort || undefined,
      status,
    });
    toast.success("Objekt aktualisiert");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background w-[calc(100vw-1rem)] max-w-xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Objekt bearbeiten</DialogTitle>
          <DialogDescription>Stammdaten und Adresse anpassen.</DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bezeichnung *">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Objektnummer">
              <Input value={nummer} onChange={(e) => setNummer(e.target.value)} className="font-mono" />
            </Field>
          </div>
          <Field label="Straße & Hausnummer">
            <Input value={strasse} onChange={(e) => setStrasse(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="PLZ"><Input value={plz} onChange={(e) => setPlz(e.target.value)} /></Field>
            <Field label="Ort" className="sm:col-span-2">
              <Input value={ort} onChange={(e) => setOrt(e.target.value)} />
            </Field>
          </div>
          <Field label="Status">
            <Select value={status} onValueChange={(v) => setStatus(v as Objekt["status"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="aktiv">Aktiv</SelectItem>
                <SelectItem value="pausiert">Pausiert</SelectItem>
                <SelectItem value="beendet">Beendet</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={speichern} disabled={update.isPending}>
            {update.isPending ? "Speichere…" : "Speichern"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
