import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
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
import { useKunden, useCreateObjekt } from "@/hooks/useApi";
import { toast } from "sonner";
import type { Reinigungsfrequenz, ObjektTyp } from "@/lib/api/types";

interface Props {
  onClose: () => void;
  defaultKundeId?: string;
}

export function ObjektForm({ onClose, defaultKundeId }: Props) {
  const { data: kunden = [] } = useKunden();
  const create = useCreateObjekt();
  const navigate = useNavigate();
  const [kundeId, setKundeId] = useState(defaultKundeId ?? "");
  const [name, setName] = useState("");
  const [typ, setTyp] = useState<ObjektTyp>("buero");
  const [strasse, setStrasse] = useState("");
  const [plz, setPlz] = useState("");
  const [ort, setOrt] = useState("");
  const [qmZuReinigen, setQm] = useState<number | "">("");
  const [frequenz, setFrequenz] = useState<Reinigungsfrequenz>("woechentlich");
  const [zugang, setZugang] = useState("");

  async function submit() {
    if (!kundeId) {
      toast.error("Bitte Kunde wählen");
      return;
    }
    if (!name.trim()) {
      toast.error("Name ist erforderlich");
      return;
    }
    const o = await create.mutateAsync({
      kundeId,
      name,
      typ,
      strasse,
      plz,
      ort,
      qmZuReinigen: typeof qmZuReinigen === "number" ? qmZuReinigen : undefined,
      frequenz,
      reinigungstage: [],
      zugangsinfo: zugang || undefined,
      status: "aktiv",
    });
    toast.success("Objekt angelegt", { description: `${o.nummer} • erfolgreich gespeichert.` });
    onClose();
    navigate({ to: "/objekte/$id", params: { id: o.id } });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
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
        <Field label="Objekttyp">
          <Select value={typ} onValueChange={(v) => setTyp(v as ObjektTyp)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="buero">Büro</SelectItem>
              <SelectItem value="wohnen">Wohnen</SelectItem>
              <SelectItem value="gewerbe">Gewerbe</SelectItem>
              <SelectItem value="industrie">Industrie</SelectItem>
              <SelectItem value="medizin">Medizin</SelectItem>
              <SelectItem value="bildung">Bildung</SelectItem>
              <SelectItem value="sonstiges">Sonstiges</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Bezeichnung *">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Bürogebäude Hauptsitz" />
      </Field>
      <Field label="Straße & Hausnummer"><Input value={strasse} onChange={(e) => setStrasse(e.target.value)} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="PLZ"><Input value={plz} onChange={(e) => setPlz(e.target.value)} /></Field>
        <Field label="Ort" className="sm:col-span-2"><Input value={ort} onChange={(e) => setOrt(e.target.value)} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="m² zu reinigen">
          <Input
            type="number"
            value={qmZuReinigen}
            onChange={(e) => setQm(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </Field>
        <Field label="Reinigungsfrequenz">
          <Select value={frequenz} onValueChange={(v) => setFrequenz(v as Reinigungsfrequenz)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="taeglich">Täglich</SelectItem>
              <SelectItem value="woechentlich">Wöchentlich</SelectItem>
              <SelectItem value="14taegig">14-tägig</SelectItem>
              <SelectItem value="monatlich">Monatlich</SelectItem>
              <SelectItem value="quartalsweise">Quartalsweise</SelectItem>
              <SelectItem value="auf_abruf">Auf Abruf</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Zugang / Hinweise">
        <Textarea rows={3} value={zugang} onChange={(e) => setZugang(e.target.value)} placeholder="Schlüssel beim Pförtner, Code …" />
      </Field>

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
