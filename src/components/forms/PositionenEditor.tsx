import { Trash2, Plus } from "lucide-react";
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
import type { Position, Einheit } from "@/lib/api/types";

export interface PositionDraft {
  id: string;
  beschreibung: string;
  menge: number;
  einheit: Einheit;
  einzelpreisNetto: number;
  steuersatz: number;
  rabatt: number;
}

interface Props {
  positionen: PositionDraft[];
  onChange: (next: PositionDraft[]) => void;
  defaultSteuersatz?: number;
}

const EINHEITEN: { value: Einheit; label: string }[] = [
  { value: "stk", label: "Stk" },
  { value: "h", label: "h" },
  { value: "m2", label: "m²" },
  { value: "pauschal", label: "Pausch." },
  { value: "tag", label: "Tag" },
  { value: "monat", label: "Monat" },
];

export function emptyPosition(steuersatz = 19): PositionDraft {
  return {
    id: crypto.randomUUID(),
    beschreibung: "",
    menge: 1,
    einheit: "stk",
    einzelpreisNetto: 0,
    steuersatz,
    rabatt: 0,
  };
}

export function summe(p: PositionDraft) {
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

export function PositionenEditor({ positionen, onChange, defaultSteuersatz = 19 }: Props) {
  const totals = summen(positionen);

  function update(idx: number, patch: Partial<PositionDraft>) {
    const next = positionen.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }
  function remove(idx: number) {
    onChange(positionen.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...positionen, emptyPosition(defaultSteuersatz)]);
  }

  return (
    <div className="rounded-2xl border border-border bg-card/50">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Beschreibung</th>
              <th className="px-3 py-2 font-medium">Menge</th>
              <th className="px-3 py-2 font-medium">Einheit</th>
              <th className="px-3 py-2 font-medium">Einzelpreis €</th>
              <th className="px-3 py-2 font-medium">MwSt %</th>
              <th className="px-3 py-2 text-right font-medium">Summe</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {positionen.map((p, i) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-2">
                  <Input
                    value={p.beschreibung}
                    onChange={(e) => update(i, { beschreibung: e.target.value })}
                    placeholder="Leistungsbeschreibung"
                    className="h-9"
                  />
                </td>
                <td className="px-3 py-2 w-20">
                  <Input
                    type="number"
                    value={p.menge}
                    onChange={(e) => update(i, { menge: Number(e.target.value) || 0 })}
                    className="h-9"
                  />
                </td>
                <td className="px-3 py-2 w-24">
                  <Select
                    value={p.einheit}
                    onValueChange={(v) => update(i, { einheit: v as Einheit })}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EINHEITEN.map((u) => (
                        <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2 w-28">
                  <Input
                    type="number"
                    step="0.01"
                    value={p.einzelpreisNetto}
                    onChange={(e) => update(i, { einzelpreisNetto: Number(e.target.value) || 0 })}
                    className="h-9"
                  />
                </td>
                <td className="px-3 py-2 w-20">
                  <Input
                    type="number"
                    value={p.steuersatz}
                    onChange={(e) => update(i, { steuersatz: Number(e.target.value) || 0 })}
                    className="h-9"
                  />
                </td>
                <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{formatEUR(summe(p))}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => remove(i)}
                    className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                    title="Position entfernen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {positionen.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-xs text-muted-foreground">
                  Noch keine Positionen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-3 py-3">
        <Button variant="outline" size="sm" onClick={add} className="rounded-full">
          <Plus className="mr-1 h-3.5 w-3.5" /> Position hinzufügen
        </Button>
        <div className="flex gap-6 text-sm">
          <span className="text-muted-foreground">
            Netto <span className="ml-1 font-semibold text-foreground">{formatEUR(totals.netto)}</span>
          </span>
          <span className="text-muted-foreground">
            MwSt <span className="ml-1 font-semibold text-foreground">{formatEUR(totals.steuer)}</span>
          </span>
          <span className="text-muted-foreground">
            Brutto <span className="ml-1 font-semibold text-primary">{formatEUR(totals.brutto)}</span>
          </span>
        </div>
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
  }));
}
