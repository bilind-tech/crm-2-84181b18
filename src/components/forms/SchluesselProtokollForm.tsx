import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { DateInput } from "@/components/ui/date-input";
import { PrimaryAction } from "@/components/layout/PrimaryAction";
import { useKunden, useObjekte, useCreateProtokoll } from "@/hooks/useApi";
import { todayISO } from "@/lib/format";
import type { SchluesselRichtung, SchluesselZeile } from "@/lib/api/types";

interface Props {
  onClose: () => void;
  defaultKundeId?: string;
  defaultObjektId?: string;
}

const emptyZeile = (): SchluesselZeile => ({
  bezeichnung: "",
  anzahl: 1,
  schluesselNr: "",
  bemerkung: "",
});

export function SchluesselProtokollForm({ onClose, defaultKundeId, defaultObjektId }: Props) {
  const navigate = useNavigate();
  const { data: kunden = [] } = useKunden();
  const { data: objekteAlle = [] } = useObjekte();
  const create = useCreateProtokoll();

  const [kundeId, setKundeId] = useState(defaultKundeId ?? "");
  const [objektId, setObjektId] = useState(defaultObjektId ?? "");
  const [datum, setDatum] = useState(todayISO());
  const [richtung, setRichtung] = useState<SchluesselRichtung>("ausgabe");
  const [pfandEur, setPfandEur] = useState<string>("");
  const [vertreterAuftraggeber, setVertreterAuftraggeber] = useState("");
  const [zeilen, setZeilen] = useState<SchluesselZeile[]>([emptyZeile()]);

  const objekteVonKunde = useMemo(
    () => objekteAlle.filter((o) => o.kundeId === kundeId),
    [objekteAlle, kundeId],
  );

  function setZeile(i: number, patch: Partial<SchluesselZeile>) {
    setZeilen((arr) => arr.map((z, idx) => (idx === i ? { ...z, ...patch } : z)));
  }

  async function submit() {
    if (!kundeId) return toast.error("Bitte Kunde wählen");
    const valid = zeilen.filter((z) => z.bezeichnung.trim() && z.anzahl > 0);
    if (valid.length === 0) return toast.error("Mindestens einen Schlüssel erfassen");
    try {
      const p = await create.mutateAsync({
        kind: "schluessel",
        kundeId,
        objektId: objektId || undefined,
        datum,
        richtung,
        pfandEur: pfandEur ? Number(pfandEur) : undefined,
        vertreterAuftraggeber,
        schluessel: valid,
        bestaetigt: true,
      });
      toast.success("Protokoll angelegt", { description: `${p.nummer} • Editor wird geöffnet.` });
      onClose();
      navigate({ to: "/protokolle/$id/bearbeiten", params: { id: p.id } });
    } catch (e) {
      console.error(e);
      toast.error("Konnte Protokoll nicht anlegen");
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kunde *">
          <Select
            value={kundeId || undefined}
            onValueChange={(v) => {
              setKundeId(v);
              setObjektId("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Kunde wählen…" />
            </SelectTrigger>
            <SelectContent>
              {kunden.map((k) => (
                <SelectItem key={k.id} value={k.id}>
                  {k.firmenname || `${k.vorname ?? ""} ${k.nachname ?? ""}`.trim()} · {k.nummer}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Objekt (optional)">
          <Select
            value={objektId || "__none__"}
            onValueChange={(v) => setObjektId(v === "__none__" ? "" : v)}
            disabled={!kundeId}
          >
            <SelectTrigger>
              <SelectValue placeholder={kundeId ? "— kein Objekt —" : "Erst Kunde wählen"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— kein Objekt —</SelectItem>
              {objekteVonKunde.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Datum">
          <DateInput value={datum} onChange={setDatum} />
        </Field>
        <Field label="Richtung">
          <Select value={richtung} onValueChange={(v) => setRichtung(v as SchluesselRichtung)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ausgabe">Ausgabe</SelectItem>
              <SelectItem value="ruecknahme">Rücknahme</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Pfand (€, optional)">
          <Input
            type="number"
            value={pfandEur}
            onChange={(e) => setPfandEur(e.target.value)}
            placeholder="0"
          />
        </Field>
      </div>

      <Field label="Vertreter Auftraggeber (optional)">
        <Input
          value={vertreterAuftraggeber}
          onChange={(e) => setVertreterAuftraggeber(e.target.value)}
          placeholder="z. B. Frau Müller"
        />
      </Field>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground">Schlüssel</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setZeilen((a) => [...a, emptyZeile()])}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Schlüssel hinzufügen
          </Button>
        </div>
        <div className="space-y-2">
          {zeilen.map((z, i) => (
            <div
              key={i}
              className="grid grid-cols-12 gap-2 rounded-lg border border-border bg-card p-2"
            >
              <Input
                className="col-span-12 sm:col-span-4"
                placeholder="Bezeichnung *"
                value={z.bezeichnung}
                onChange={(e) => setZeile(i, { bezeichnung: e.target.value })}
              />
              <Input
                className="col-span-4 sm:col-span-2"
                type="number"
                min={1}
                placeholder="Anzahl"
                value={z.anzahl}
                onChange={(e) => setZeile(i, { anzahl: Number(e.target.value) || 0 })}
              />
              <Input
                className="col-span-8 sm:col-span-3"
                placeholder="Schlüssel-Nr."
                value={z.schluesselNr}
                onChange={(e) => setZeile(i, { schluesselNr: e.target.value })}
              />
              <Input
                className="col-span-11 sm:col-span-2"
                placeholder="Bemerkung"
                value={z.bemerkung}
                onChange={(e) => setZeile(i, { bemerkung: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setZeilen((arr) => arr.filter((_, idx) => idx !== i))}
                className="col-span-1 inline-flex items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
                disabled={zeilen.length === 1}
                title="Zeile entfernen"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 -mx-4 -mb-6 mt-2 flex flex-col-reverse items-stretch gap-2 border-t border-border bg-background px-4 py-3 sm:-mx-8 sm:px-8 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          Abbrechen
        </Button>
        <PrimaryAction
          icon={Check}
          label={create.isPending ? "Speichere…" : "Protokoll anlegen"}
          onClick={submit}
          disabled={create.isPending}
        />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
