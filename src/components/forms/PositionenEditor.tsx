import { Trash2, Plus, FileText, Receipt, Clock, ChevronUp, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatEUR } from "@/lib/format";
import type { Position, Einheit, PositionModus } from "@/lib/api/types";
import { LeistungsBeschreibung } from "./LeistungsBeschreibung";
import { cn } from "@/lib/utils";
import { createClientId } from "@/lib/clientId";

export interface PositionDraft {
  id: string;
  modus: PositionModus;
  beschreibung: string;
  menge: number;
  einheit: Einheit;
  einzelpreisNetto: number;
  pauschalpreisNetto: number;
  ausfuehrung: string;
  steuersatz: number;
  rabatt: number;
}

interface Props {
  positionen: PositionDraft[];
  onChange: (next: PositionDraft[]) => void;
  defaultSteuersatz?: number;
  /** Wird vom Form als Default-Wert für „Ausführung" durchgereicht (z. B. „Mo–Fr · 5× wöchentlich"). */
  defaultAusfuehrung?: string;
}

const EINHEITEN: { value: Einheit; label: string }[] = [
  { value: "stk", label: "Stk" },
  { value: "h", label: "h" },
  { value: "m2", label: "m²" },
  { value: "pauschal", label: "Pausch." },
  { value: "tag", label: "Tag" },
  { value: "monat", label: "Monat" },
];

export function emptyPosition(steuersatz = 19, modus: PositionModus = "pauschal"): PositionDraft {
  return {
    id: createClientId("pos"),
    modus,
    beschreibung: "",
    menge: 1,
    einheit: modus === "pauschal" ? "pauschal" : modus === "stunden" ? "h" : "stk",
    einzelpreisNetto: 0,
    pauschalpreisNetto: 0,
    ausfuehrung: "",
    steuersatz,
    rabatt: 0,
  };
}

export function summe(p: PositionDraft) {
  if (p.modus === "pauschal") {
    return p.pauschalpreisNetto * (1 - p.rabatt / 100);
  }
  return p.menge * p.einzelpreisNetto * (1 - p.rabatt / 100);
}

export function summen(positionen: PositionDraft[]) {
  let netto = 0;
  let steuer = 0;
  for (const p of positionen) {
    const n = summe(p);
    netto += n;
    steuer += n * (p.steuersatz / 100);
  }
  return { netto, steuer, brutto: netto + steuer };
}

export function PositionenEditor({
  positionen,
  onChange,
  defaultSteuersatz = 19,
  defaultAusfuehrung,
}: Props) {
  const totals = summen(positionen);

  function update(idx: number, patch: Partial<PositionDraft>) {
    const next = positionen.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }
  function remove(idx: number) {
    onChange(positionen.filter((_, i) => i !== idx));
  }
  function add(modus: PositionModus) {
    const p = emptyPosition(defaultSteuersatz, modus);
    if (modus === "pauschal" && defaultAusfuehrung) p.ausfuehrung = defaultAusfuehrung;
    onChange([...positionen, p]);
  }

  return (
    <div className="rounded-2xl border border-border bg-card/50">
      <div className="space-y-3 p-3">
        {positionen.map((p, i) => (
          <PositionCard
            key={p.id}
            index={i}
            position={p}
            onChange={(patch) => update(i, patch)}
            onRemove={() => remove(i)}
          />
        ))}
        {positionen.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            Noch keine Positionen.
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-3 py-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => add("pauschal")} className="rounded-full">
            <Plus className="mr-1 h-3.5 w-3.5" /> Pauschal
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => add("stunden")}
            className="rounded-full"
          >
            <Clock className="mr-1 h-3.5 w-3.5" /> Stunden
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => add("einzel")}
            className="rounded-full"
          >
            <FileText className="mr-1 h-3.5 w-3.5" /> Einzel
          </Button>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm">
          <span className="text-muted-foreground">
            Netto{" "}
            <span className="ml-1 font-semibold text-foreground">{formatEUR(totals.netto)}</span>
          </span>
          <span className="text-muted-foreground">
            MwSt{" "}
            <span className="ml-1 font-semibold text-foreground">{formatEUR(totals.steuer)}</span>
          </span>
          <span className="text-muted-foreground">
            Brutto{" "}
            <span className="ml-1 font-semibold text-primary">{formatEUR(totals.brutto)}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

interface CardProps {
  index: number;
  position: PositionDraft;
  onChange: (patch: Partial<PositionDraft>) => void;
  onRemove: () => void;
}

function PositionCard({ index, position: p, onChange, onRemove }: CardProps) {
  const istPauschal = p.modus === "pauschal";
  const istStunden = p.modus === "stunden";

  return (
    <div className="rounded-xl border border-border bg-background p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-muted-foreground">Position {index + 1}</span>
        <div className="flex items-center gap-2">
          <ModusSwitch
            value={p.modus}
            onChange={(m) => {
              const patch: Partial<PositionDraft> = { modus: m };
              if (m === "stunden") patch.einheit = "h";
              else if (m === "pauschal") patch.einheit = "pauschal";
              else patch.einheit = "stk";
              onChange(patch);
            }}
          />
          <button
            onClick={onRemove}
            className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
            aria-label="Position entfernen"
            title="Position entfernen"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {istPauschal ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Ausführung (optional, z. B. „Mo–Fr · 5× wöchentlich")
            </label>
            <Input
              value={p.ausfuehrung}
              onChange={(e) => onChange({ ausfuehrung: e.target.value })}
              placeholder="z. B. Täglich · Mo–Fr · 5× wöchentlich"
              className="h-10"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Leistungsbeschreibung
            </label>
            <LeistungsBeschreibung
              value={p.beschreibung}
              onChange={(v) => onChange({ beschreibung: v })}
              placeholder={
                "Büro Unterhalts- + Sanitäranlagenreinigung\n• Böden feucht wischen / Teppichböden saugen\n• Schreibtische & freie Oberflächen abwischen\n• Papierkörbe entleeren"
              }
              minRows={6}
              maxRows={20}
              withToolbar
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Tipp: <kbd className="rounded border border-border bg-muted px-1">Enter</kbd> nach „•"
              setzt automatisch einen neuen Aufzählungspunkt.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Pauschalpreis (netto) €
              </label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={p.pauschalpreisNetto || ""}
                onChange={(e) => onChange({ pauschalpreisNetto: Number(e.target.value) || 0 })}
                className="h-11 text-base font-semibold"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                MwSt
              </label>
              <MwStStepper value={p.steuersatz} onChange={(v) => onChange({ steuersatz: v })} />
            </div>
          </div>
        </div>
      ) : istStunden ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Leistungsbeschreibung
            </label>
            <LeistungsBeschreibung
              value={p.beschreibung}
              onChange={(v) => onChange({ beschreibung: v })}
              placeholder="z. B. Sonderreinigung nach Aufwand"
              minRows={2}
              maxRows={10}
              withToolbar
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Stunden
              </label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.25"
                value={p.menge || ""}
                onChange={(e) => onChange({ menge: Number(e.target.value) || 0 })}
                className="h-11 text-base font-semibold"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Stundensatz (netto) €
              </label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={p.einzelpreisNetto || ""}
                onChange={(e) => onChange({ einzelpreisNetto: Number(e.target.value) || 0 })}
                className="h-11 text-base font-semibold"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                MwSt
              </label>
              <MwStStepper value={p.steuersatz} onChange={(v) => onChange({ steuersatz: v })} />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Leistungsbeschreibung
            </label>
            <LeistungsBeschreibung
              value={p.beschreibung}
              onChange={(v) => onChange({ beschreibung: v })}
              placeholder="z. B. Treppenhaus-Reinigung"
              minRows={2}
              maxRows={10}
              withToolbar
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Preis (netto) €
              </label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={p.einzelpreisNetto || ""}
                onChange={(e) => onChange({ einzelpreisNetto: Number(e.target.value) || 0 })}
                className="h-11 text-base font-semibold"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                MwSt
              </label>
              <MwStStepper value={p.steuersatz} onChange={(v) => onChange({ steuersatz: v })} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModusSwitch({
  value,
  onChange,
}: {
  value: PositionModus;
  onChange: (m: PositionModus) => void;
}) {
  const opts: { v: PositionModus; label: string; Icon: typeof Receipt }[] = [
    { v: "pauschal", label: "Pauschal", Icon: Receipt },
    { v: "stunden", label: "Stunden", Icon: Clock },
    { v: "einzel", label: "Einzel", Icon: FileText },
  ];
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted p-0.5 text-xs">
      {opts.map(({ v, label, Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-1 font-medium transition",
            value === v
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-3 w-3" />
          {label}
        </button>
      ))}
    </div>
  );
}

function MwStStepper({
  value,
  onChange,
  min = 0,
  max = 25,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="flex h-11 items-stretch overflow-hidden rounded-md border border-input bg-background">
      <div className="flex flex-1 items-center justify-center text-base font-semibold tabular-nums">
        {value}&nbsp;%
      </div>
      <div className="flex w-9 flex-col border-l border-input">
        <button
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          aria-label="MwSt erhöhen"
          className="flex flex-1 items-center justify-center text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          aria-label="MwSt verringern"
          className="flex flex-1 items-center justify-center border-t border-input text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function toApiPositionen(draft: PositionDraft[]): Position[] {
  return draft.map((p) => ({
    id: p.id,
    beschreibung: p.beschreibung,
    menge: p.menge,
    einheit: p.einheit,
    einzelpreisNetto: p.einzelpreisNetto,
    steuersatz: p.steuersatz,
    rabatt: p.rabatt,
    modus: p.modus,
    pauschalpreisNetto: p.modus === "pauschal" ? p.pauschalpreisNetto : undefined,
    ausfuehrung: p.ausfuehrung || undefined,
  }));
}

/** Lädt eine API-Position zurück in einen Draft (für „Bearbeiten"-Flows). */
export function fromApiPosition(p: Position): PositionDraft {
  return {
    id: p.id,
    modus: p.modus ?? "einzel",
    beschreibung: p.beschreibung,
    menge: p.menge,
    einheit: p.einheit,
    einzelpreisNetto: p.einzelpreisNetto,
    pauschalpreisNetto: p.pauschalpreisNetto ?? 0,
    ausfuehrung: p.ausfuehrung ?? "",
    steuersatz: p.steuersatz,
    rabatt: p.rabatt,
  };
}
