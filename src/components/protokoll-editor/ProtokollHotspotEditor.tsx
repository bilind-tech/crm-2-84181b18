// Inline-Mini-Editor für Protokoll-Hotspots. Schreibt direkt in den Draft
// via `set(key, value)`. Pro Feld passende UI-Komponenten. Button „Erweitert"
// öffnet den passenden Tab im rechten Panel.

import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { protokollMetaForId } from "@/lib/pdf/fieldMap";
import type {
  Protokoll,
  UebergabeProtokoll,
  SchluesselProtokoll,
  SchluesselZeile,
  ProtokollOptionen,
} from "@/lib/api/types";

interface Props {
  fieldId: string;
  draft: Protokoll;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: (key: any, value: any) => void;
  onOpenAdvanced: () => void;
  onClose: () => void;
}

export function ProtokollHotspotEditor({ fieldId, draft, set, onOpenAdvanced, onClose }: Props) {
  const meta = protokollMetaForId(fieldId);
  const isU = draft.kind === "uebergabe";
  const u = draft as UebergabeProtokoll;
  const s = draft as SchluesselProtokoll;
  const opt: ProtokollOptionen = draft.optionen ?? {};

  const setOpt = <K extends keyof ProtokollOptionen>(k: K, v: ProtokollOptionen[K]) => {
    const next: ProtokollOptionen = { ...opt, [k]: v };
    set("optionen", next);
  };

  const Header = (
    <div className="mb-2 flex items-center justify-between gap-2">
      <p className="text-xs font-semibold text-foreground">{meta.label}</p>
      <button
        type="button"
        onClick={onOpenAdvanced}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Pencil className="h-3 w-3" />
        Erweitert
      </button>
    </div>
  );

  // ────── Inhalt / Meta ──────
  if (fieldId === "meta") {
    return (
      <div className="w-[280px]">
        {Header}
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Datum</Label>
            <Input
              type="date"
              value={draft.datum}
              onChange={(e) => set("datum", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Uhrzeit</Label>
            <Input
              type="time"
              value={draft.uhrzeit}
              onChange={(e) => set("uhrzeit", e.target.value)}
            />
          </div>
        </div>
      </div>
    );
  }

  if (fieldId === "kunde") {
    return (
      <div className="w-[260px]">
        {Header}
        <p className="text-xs text-muted-foreground">
          Kunde und Objekt werden im Tab <strong>Inhalt</strong> ausgewählt.
        </p>
        <Button size="sm" variant="outline" onClick={onOpenAdvanced} className="mt-2 w-full">
          Inhalt öffnen
        </Button>
      </div>
    );
  }

  // ────── Titel + Art/Richtung + Untertitel + Override ──────
  if (fieldId === "titel") {
    return (
      <div className="w-[320px]">
        {Header}
        <div className="space-y-3">
          {isU ? (
            <div className="space-y-1">
              <Label className="text-[11px]">Art</Label>
              <RadioGroup
                value={u.art}
                onValueChange={(v) =>
                  set("art", v as UebergabeProtokoll["art"])
                }
                className="flex flex-wrap gap-3"
              >
                <label className="flex items-center gap-1.5 text-xs">
                  <RadioGroupItem value="uebergabe" /> Übergabe
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <RadioGroupItem value="abnahme" /> Abnahme
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <RadioGroupItem value="beides" /> Beides
                </label>
              </RadioGroup>
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-[11px]">Richtung</Label>
              <RadioGroup
                value={s.richtung}
                onValueChange={(v) =>
                  set("richtung", v as SchluesselProtokoll["richtung"])
                }
                className="flex flex-wrap gap-3"
              >
                <label className="flex items-center gap-1.5 text-xs">
                  <RadioGroupItem value="ausgabe" /> Ausgabe
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <RadioGroupItem value="ruecknahme" /> Rücknahme
                </label>
              </RadioGroup>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-[11px]">Titel-Override (leer = Standard)</Label>
            <Input
              value={opt.titelOverride ?? ""}
              onChange={(e) => setOpt("titelOverride", e.target.value || undefined)}
              placeholder="z. B. Abnahmeprotokoll Reinigung"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Untertitel</Label>
            <Input
              value={opt.untertitel ?? ""}
              onChange={(e) => setOpt("untertitel", e.target.value || undefined)}
              placeholder="optional"
            />
          </div>
        </div>
      </div>
    );
  }

  // ────── Übergabe-spezifisch ──────
  if (fieldId === "leistungsumfang" && isU) {
    return (
      <div className="w-[360px]">
        {Header}
        <Textarea
          rows={5}
          value={u.leistungsumfang}
          onChange={(e) => set("leistungsumfang", e.target.value)}
          autoFocus
        />
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={onClose}>
            Fertig
          </Button>
        </div>
      </div>
    );
  }

  if (fieldId === "bemerkungen" && isU) {
    return (
      <div className="w-[360px]">
        {Header}
        <Textarea
          rows={5}
          value={u.bemerkungen}
          onChange={(e) => set("bemerkungen", e.target.value)}
          placeholder="Keine."
          autoFocus
        />
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={onClose}>
            Fertig
          </Button>
        </div>
      </div>
    );
  }

  if (fieldId === "ergebnis" && isU) {
    return (
      <div className="w-[300px]">
        {Header}
        <label className="flex items-start gap-2 text-xs">
          <Checkbox
            checked={u.ohneVorbehalt}
            onCheckedChange={(v) => set("ohneVorbehalt", v === true)}
          />
          <span>Abnahme erfolgt ohne Vorbehalt</span>
        </label>
      </div>
    );
  }

  // ────── Schlüssel-spezifisch ──────
  if (fieldId === "schluessel.tabelle" && !isU) {
    const zeilen = s.schluessel ?? [];
    const updZeile = (i: number, patch: Partial<SchluesselZeile>) =>
      set(
        "schluessel",
        zeilen.map((z, idx) => (idx === i ? { ...z, ...patch } : z)),
      );
    const addZeile = () =>
      set("schluessel", [
        ...zeilen,
        { bezeichnung: "", anzahl: 1, schluesselNr: "", bemerkung: "" },
      ]);
    const delZeile = (i: number) =>
      set("schluessel", zeilen.length > 1 ? zeilen.filter((_, idx) => idx !== i) : zeilen);
    const moveZeile = (i: number, dir: -1 | 1) => {
      const j = i + dir;
      if (j < 0 || j >= zeilen.length) return;
      const next = [...zeilen];
      [next[i], next[j]] = [next[j], next[i]];
      set("schluessel", next);
    };
    const dupZeile = (i: number) => {
      const next = [...zeilen];
      next.splice(i + 1, 0, { ...zeilen[i] });
      set("schluessel", next);
    };
    return (
      <div className="w-[520px] max-w-[92vw]">
        {Header}
        <div className="mb-1 grid grid-cols-[1fr_60px_100px_1fr_auto] gap-1.5 px-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>Bezeichnung</span>
          <span className="text-center">Anz.</span>
          <span>Schlüssel-Nr.</span>
          <span>Bemerkung</span>
          <span />
        </div>
        <div className="max-h-[340px] space-y-1 overflow-y-auto pr-1">
          {zeilen.map((z, i) => (
            <div
              key={i}
              className="group/row grid grid-cols-[1fr_60px_100px_1fr_auto] items-center gap-1.5 rounded-md border bg-background p-1.5 hover:bg-muted/30"
            >
              <Input
                className="h-8"
                placeholder="Bezeichnung"
                value={z.bezeichnung}
                onChange={(e) => updZeile(i, { bezeichnung: e.target.value })}
              />
              <Input
                className="h-8"
                type="number"
                min={1}
                value={z.anzahl}
                onChange={(e) => updZeile(i, { anzahl: Number(e.target.value) || 0 })}
              />
              <Input
                className="h-8"
                placeholder="Schlüssel-Nr."
                value={z.schluesselNr}
                onChange={(e) => updZeile(i, { schluesselNr: e.target.value })}
              />
              <Input
                className="h-8"
                placeholder="Bemerkung"
                value={z.bemerkung}
                onChange={(e) => updZeile(i, { bemerkung: e.target.value })}
              />
              <div className="flex items-center gap-0.5 opacity-60 transition group-hover/row:opacity-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => moveZeile(i, -1)}
                  disabled={i === 0}
                  aria-label="Nach oben"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => moveZeile(i, 1)}
                  disabled={i === zeilen.length - 1}
                  aria-label="Nach unten"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => dupZeile(i)}
                  aria-label="Duplizieren"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  onClick={() => delZeile(i)}
                  disabled={zeilen.length === 1}
                  aria-label="Zeile löschen"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addZeile}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Zeile hinzufügen
          </Button>
          <Button type="button" size="sm" onClick={onClose}>
            Fertig
          </Button>
        </div>
      </div>
    );
  }

  if (fieldId === "pfand" && !isU) {
    return (
      <div className="w-[220px]">
        {Header}
        <Label className="text-[11px]">Pfand (EUR)</Label>
        <Input
          inputMode="decimal"
          value={s.pfandEur ?? ""}
          onChange={(e) => {
            const v = e.target.value.replace(",", ".");
            const n = v === "" ? undefined : parseFloat(v);
            set("pfandEur", Number.isFinite(n as number) ? (n as number) : undefined);
          }}
          placeholder="0,00"
          autoFocus
        />
      </div>
    );
  }

  if (fieldId === "bestaetigung" && !isU) {
    return (
      <div className="w-[300px]">
        {Header}
        <label className="flex items-start gap-2 text-xs">
          <Checkbox
            checked={s.bestaetigt}
            onCheckedChange={(v) => set("bestaetigt", v === true)}
          />
          <span>Empfang/Rückgabe wird bestätigt</span>
        </label>
      </div>
    );
  }

  // ────── Unterschriften ──────
  if (fieldId === "unterschriften") {
    return (
      <div className="w-[320px]">
        {Header}
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Vertreter Auftraggeber</Label>
            <Input
              value={draft.vertreterAuftraggeber}
              onChange={(e) => set("vertreterAuftraggeber", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Vertreter Auftragnehmer</Label>
            <Input
              value={draft.vertreterAuftragnehmer}
              onChange={(e) => set("vertreterAuftragnehmer", e.target.value)}
            />
          </div>
        </div>
      </div>
    );
  }

  // ────── Zusatzklausel ──────
  if (fieldId === "klausel") {
    return (
      <div className="w-[360px]">
        {Header}
        <Textarea
          rows={4}
          value={opt.zusatzKlausel ?? ""}
          onChange={(e) => setOpt("zusatzKlausel", e.target.value || undefined)}
          placeholder="Eigener Absatz, der vor den Unterschriften erscheint"
          autoFocus
        />
      </div>
    );
  }

  return (
    <div className="w-[220px]">
      {Header}
      <p className="text-xs text-muted-foreground">Kein Inline-Editor verfügbar.</p>
    </div>
  );
}