// Editor-Panel für Schlüsselübergabe.
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { KundenObjektPicker } from "@/components/werkzeuge/KundenObjektPicker";
import type {
  Kunde,
  Objekt,
  SchluesselProtokoll,
  SchluesselRichtung,
  SchluesselZeile,
} from "@/lib/api/types";

interface Props {
  draft: SchluesselProtokoll;
  kunde?: Kunde;
  objekt?: Objekt;
  set: <K extends keyof SchluesselProtokoll>(key: K, value: SchluesselProtokoll[K]) => void;
  onKundeChange: (k: Kunde | undefined) => void;
  onObjektChange: (o: Objekt | undefined) => void;
}

export function SchluesselPanel({
  draft,
  kunde,
  objekt,
  set,
  onKundeChange,
  onObjektChange,
}: Props) {
  const zeilen = draft.schluessel ?? [];
  const updZeile = (i: number, patch: Partial<SchluesselZeile>) => {
    set(
      "schluessel",
      zeilen.map((z, idx) => (idx === i ? { ...z, ...patch } : z)),
    );
  };
  const addZeile = () =>
    set("schluessel", [...zeilen, { bezeichnung: "", anzahl: 1, schluesselNr: "", bemerkung: "" }]);
  const delZeile = (i: number) =>
    set("schluessel", zeilen.length > 1 ? zeilen.filter((_, idx) => idx !== i) : zeilen);

  return (
    <div className="space-y-5">
      <KundenObjektPicker
        kundeId={kunde?.id}
        objektId={objekt?.id}
        onKundeChange={(k) => {
          onKundeChange(k);
          set("kundeId", k?.id);
          set("objektId", undefined);
        }}
        onObjektChange={(o) => {
          onObjektChange(o);
          set("objektId", o?.id);
        }}
      />
      <div className="space-y-2">
        <Label>Richtung</Label>
        <RadioGroup
          value={draft.richtung}
          onValueChange={(v) => set("richtung", v as SchluesselRichtung)}
          className="flex flex-wrap gap-4"
        >
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="ausgabe" /> Ausgabe an Kunden
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="ruecknahme" /> Rücknahme von Kunden
          </label>
        </RadioGroup>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Datum</Label>
          <Input type="date" value={draft.datum} onChange={(e) => set("datum", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Uhrzeit</Label>
          <Input
            type="time"
            value={draft.uhrzeit}
            onChange={(e) => set("uhrzeit", e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Schlüssel</Label>
          <Button type="button" variant="ghost" size="sm" onClick={addZeile}>
            <Plus className="mr-1.5 h-4 w-4" />
            Zeile
          </Button>
        </div>
        <div className="space-y-2">
          {zeilen.map((z, i) => (
            <div
              key={i}
              className="grid gap-2 rounded-xl border bg-muted/20 p-2 sm:grid-cols-[1fr_70px_120px_1fr_auto]"
            >
              <Input
                placeholder="Bezeichnung (z. B. Haupteingang)"
                value={z.bezeichnung}
                onChange={(e) => updZeile(i, { bezeichnung: e.target.value })}
              />
              <Input
                type="number"
                min={1}
                placeholder="Anz."
                value={z.anzahl}
                onChange={(e) => updZeile(i, { anzahl: Number(e.target.value) || 0 })}
              />
              <Input
                placeholder="Schlüssel-Nr."
                value={z.schluesselNr}
                onChange={(e) => updZeile(i, { schluesselNr: e.target.value })}
              />
              <Input
                placeholder="Bemerkung"
                value={z.bemerkung}
                onChange={(e) => updZeile(i, { bemerkung: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => delZeile(i)}
                disabled={zeilen.length === 1}
                aria-label="Zeile löschen"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Pfand (EUR, optional)</Label>
          <Input
            inputMode="decimal"
            value={draft.pfandEur ?? ""}
            onChange={(e) => {
              const v = e.target.value.replace(",", ".");
              const n = v === "" ? undefined : parseFloat(v);
              set("pfandEur", Number.isFinite(n as number) ? (n as number) : undefined);
            }}
            placeholder="0,00"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Vertreter Auftraggeber</Label>
          <Input
            value={draft.vertreterAuftraggeber}
            onChange={(e) => set("vertreterAuftraggeber", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Vertreter Auftragnehmer</Label>
          <Input
            value={draft.vertreterAuftragnehmer}
            onChange={(e) => set("vertreterAuftragnehmer", e.target.value)}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={draft.bestaetigt}
          onCheckedChange={(v) => set("bestaetigt", v === true)}
        />
        Empfang/Rückgabe wird hiermit bestätigt
      </label>
    </div>
  );
}
