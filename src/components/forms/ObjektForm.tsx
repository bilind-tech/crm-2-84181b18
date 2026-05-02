import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
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
import { useKunden, useCreateObjekt } from "@/hooks/useApi";
import { toast } from "sonner";

interface Props {
  onClose: () => void;
  defaultKundeId?: string;
  /** Kompakte Schnell-Anlage: nur Bezeichnung. Wird im Kunden-Detail genutzt. */
  kompakt?: boolean;
}

export function ObjektForm({ onClose, defaultKundeId, kompakt }: Props) {
  const { data: kunden = [] } = useKunden();
  const create = useCreateObjekt();
  const navigate = useNavigate();
  const [kundeId, setKundeId] = useState(defaultKundeId ?? "");
  const [name, setName] = useState("");
  const [nummer, setNummer] = useState("");
  const [strasse, setStrasse] = useState("");
  const [plz, setPlz] = useState("");
  const [ort, setOrt] = useState("");

  const isKompakt = kompakt ?? false;

  async function submit() {
    if (!kundeId) {
      toast.error("Bitte Kunde wählen");
      return;
    }
    if (!name.trim()) {
      toast.error("Name ist erforderlich");
      return;
    }
    const o = await create.mutateAsync(
      isKompakt
        ? {
            kundeId,
            name,
            typ: "buero",
            frequenz: "auf_abruf",
            reinigungstage: [],
            status: "aktiv",
          }
        : {
            kundeId,
            name,
            nummer: nummer.trim() || undefined,
            typ: "buero",
            strasse: strasse || undefined,
            plz: plz || undefined,
            ort: ort || undefined,
            frequenz: "auf_abruf",
            reinigungstage: [],
            status: "aktiv",
          }
    );
    toast.success("Objekt angelegt", { description: `${o.nummer} • erfolgreich gespeichert.` });
    onClose();
    navigate({ to: "/objekte/$id", params: { id: o.id } });
  }

  if (isKompakt) {
    return (
      <div className="space-y-4">
        <Field label="Bezeichnung *">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Bürogebäude Hauptsitz"
          />
        </Field>
        <p className="text-xs text-muted-foreground">
          Adresse und weitere Details kannst du später auf der Objekt-Detailseite ergänzen.
        </p>
        <div className="sticky bottom-0 -mx-4 -mb-6 mt-2 flex flex-col-reverse items-stretch gap-2 border-t border-border bg-background px-4 py-3 sm:-mx-8 sm:px-8 sm:flex-row sm:items-center sm:justify-end">
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button disabled={create.isPending} onClick={submit} className="rounded-md px-6">
            {create.isPending ? "Speichere…" : "Objekt anlegen"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Field label="Kunde *">
        <Select value={kundeId || undefined} onValueChange={setKundeId}>
          <SelectTrigger><SelectValue placeholder="Kunde wählen…" /></SelectTrigger>
          <SelectContent>
            {kunden.map((k) => (
              <SelectItem key={k.id} value={k.id}>
                {k.firmenname || `${k.vorname ?? ""} ${k.nachname ?? ""}`.trim()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bezeichnung *">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Bürogebäude Hauptsitz" />
        </Field>
        <Field label="Objektnummer">
          <Input
            value={nummer}
            onChange={(e) => setNummer(e.target.value)}
            placeholder="leer = automatisch"
            className="font-mono"
          />
        </Field>
      </div>
      <Field label="Straße & Hausnummer"><Input value={strasse} onChange={(e) => setStrasse(e.target.value)} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="PLZ"><Input value={plz} onChange={(e) => setPlz(e.target.value)} /></Field>
        <Field label="Ort" className="sm:col-span-2"><Input value={ort} onChange={(e) => setOrt(e.target.value)} /></Field>
      </div>

      <div className="sticky bottom-0 -mx-4 -mb-6 mt-2 flex flex-col-reverse items-stretch gap-2 border-t border-border bg-background px-4 py-3 sm:-mx-8 sm:px-8 sm:flex-row sm:items-center sm:justify-end ">
        <Button variant="outline" onClick={onClose}>Abbrechen</Button>
        <Button disabled={create.isPending} onClick={submit} className="rounded-md px-6">
          {create.isPending ? "Speichere…" : "Objekt anlegen"}
        </Button>
      </div>
    </div>
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
