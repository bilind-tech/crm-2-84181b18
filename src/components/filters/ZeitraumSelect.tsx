// Wiederverwendbarer Zeitraum-Filter (Jahr + Monat) für Dashboard und Listen.
// Schlicht, dezent, mobile-first. Reset-X erscheint nur, wenn Filter aktiv.

import { useMemo } from "react";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MONATE_DE,
  ZEITRAUM_ALLE,
  jahreAusDaten,
  zeitraumIstAktiv,
  type ZeitraumState,
} from "@/components/filters/ZeitraumFilter";

interface Props {
  zeitraum: ZeitraumState;
  setZeitraum: (v: ZeitraumState) => void;
  verfuegbareDaten: string[];
  /** "inline" = kompakt (Desktop), "stretch" = volle Breite, 50/50 (Mobile) */
  size?: "inline" | "stretch";
  className?: string;
}

export function ZeitraumSelect({
  zeitraum,
  setZeitraum,
  verfuegbareDaten,
  size = "inline",
  className = "",
}: Props) {
  const jahre = useMemo(() => jahreAusDaten(verfuegbareDaten), [verfuegbareDaten]);
  const aktiv = zeitraumIstAktiv(zeitraum);

  const triggerBase =
    "h-9 rounded-full border-border bg-background text-sm";
  const jahrTrigger =
    size === "stretch" ? `${triggerBase} w-full` : `${triggerBase} w-[120px]`;
  const monatTrigger =
    size === "stretch"
      ? `${triggerBase} w-full disabled:opacity-50`
      : `${triggerBase} w-[140px] disabled:opacity-50`;

  return (
    <div
      className={`flex items-center gap-1.5 ${
        size === "stretch" ? "w-full" : ""
      } ${className}`}
    >
      <div className={size === "stretch" ? "grid flex-1 grid-cols-2 gap-2" : "flex items-center gap-1.5"}>
        <Select
          value={zeitraum.jahr}
          onValueChange={(v) =>
            setZeitraum({ jahr: v, monat: v === "alle" ? "alle" : zeitraum.monat })
          }
        >
          <SelectTrigger className={jahrTrigger}>
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
          value={zeitraum.monat}
          onValueChange={(v) => setZeitraum({ ...zeitraum, monat: v })}
          disabled={zeitraum.jahr === "alle"}
        >
          <SelectTrigger className={monatTrigger}>
            <SelectValue placeholder="Monat" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Monate</SelectItem>
            {MONATE_DE.map((m, i) => {
              const v = String(i + 1).padStart(2, "0");
              return (
                <SelectItem key={v} value={v}>
                  {m}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      {aktiv && (
        <button
          type="button"
          onClick={() => setZeitraum(ZEITRAUM_ALLE)}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Zeitraum-Filter zurücksetzen"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Hübsches Label für aktiven Zeitraum: "Mai 2026" / "2026" / "gesamt" */
export function formatZeitraumLabel(z: ZeitraumState): string {
  if (z.jahr === "alle") return "gesamt";
  if (z.monat === "alle") return z.jahr;
  const m = MONATE_DE[parseInt(z.monat, 10) - 1] ?? z.monat;
  return `${m} ${z.jahr}`;
}
