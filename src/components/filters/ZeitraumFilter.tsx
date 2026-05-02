// Zeitraum-Filter (Jahr + Monat) für Listen-Ansichten.
// Arbeitet mit ISO-Datums-Strings ("YYYY-MM-DD") — String-Slice statt Date-Parsing.

import { useMemo } from "react";
import { Calendar as CalendarIcon, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export interface ZeitraumState {
  /** "alle" oder "YYYY" */
  jahr: string;
  /** "alle" oder "01"–"12" */
  monat: string;
}

export const ZEITRAUM_ALLE: ZeitraumState = { jahr: "alle", monat: "alle" };

interface Props {
  value: ZeitraumState;
  onChange: (v: ZeitraumState) => void;
  /** Liste verfügbarer ISO-Datums-Strings (z. B. erstelltAm aller Belege) */
  verfuegbareDaten: string[];
  className?: string;
}

export function ZeitraumFilter({ value, onChange, verfuegbareDaten, className }: Props) {
  const jahre = useMemo(() => {
    const set = new Set<string>();
    for (const d of verfuegbareDaten) {
      if (d && d.length >= 4) set.add(d.slice(0, 4));
    }
    set.add(new Date().getFullYear().toString());
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [verfuegbareDaten]);

  const aktiv = value.jahr !== "alle" || value.monat !== "alle";

  return (
    <div
      className={`flex w-full min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2.5 shadow-sm ${className ?? ""}`}
    >
      <div className="flex items-center gap-1.5 pl-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <CalendarIcon className="h-3.5 w-3.5" />
        Zeitraum
      </div>

      <Select
        value={value.jahr}
        onValueChange={(v) =>
          onChange({ jahr: v, monat: v === "alle" ? "alle" : value.monat })
        }
      >
        <SelectTrigger className="h-9 w-[130px] rounded-full border-border bg-background text-sm">
          <SelectValue placeholder="Jahr" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="alle">Alle Jahre</SelectItem>
          {jahre.map((j) => (
            <SelectItem key={j} value={j}>
              {j}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.monat}
        onValueChange={(v) => onChange({ ...value, monat: v })}
        disabled={value.jahr === "alle"}
      >
        <SelectTrigger className="h-9 w-[150px] rounded-full border-border bg-background text-sm disabled:opacity-50">
          <SelectValue placeholder="Monat" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="alle">Alle Monate</SelectItem>
          {MONATE.map((m, i) => {
            const v = String(i + 1).padStart(2, "0");
            return (
              <SelectItem key={v} value={v}>
                {m}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      {aktiv && (
        <button
          type="button"
          onClick={() => onChange(ZEITRAUM_ALLE)}
          className="ml-auto inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Zeitraum-Filter zurücksetzen"
        >
          <X className="h-3.5 w-3.5" />
          Zurücksetzen
        </button>
      )}
    </div>
  );
}

/**
 * Prüft, ob ein ISO-Datum (YYYY-MM-DD) in den gewählten Zeitraum fällt.
 */
export function passtInZeitraum(isoDatum: string | undefined, z: ZeitraumState): boolean {
  if (z.jahr === "alle") return true;
  if (!isoDatum || isoDatum.length < 7) return false;
  if (isoDatum.slice(0, 4) !== z.jahr) return false;
  if (z.monat !== "alle" && isoDatum.slice(5, 7) !== z.monat) return false;
  return true;
}
