import { CalendarClock } from "lucide-react";
import type { WiederkehrendDetails, WiederkehrendRhythmus } from "@/lib/api/types";
import { cn } from "@/lib/utils";

interface Props {
  value: WiederkehrendDetails;
  onChange: (next: WiederkehrendDetails) => void;
}

const RHYTHMEN: { value: WiederkehrendRhythmus; label: string }[] = [
  { value: "woechentlich", label: "Wöchentlich" },
  { value: "monatlich", label: "Monatlich" },
  { value: "quartalsweise", label: "Quartalsweise" },
  { value: "jaehrlich", label: "Jährlich" },
];

const WOCHENTAGE: { value: number; kurz: string; lang: string }[] = [
  { value: 1, kurz: "Mo", lang: "Montag" },
  { value: 2, kurz: "Di", lang: "Dienstag" },
  { value: 3, kurz: "Mi", lang: "Mittwoch" },
  { value: 4, kurz: "Do", lang: "Donnerstag" },
  { value: 5, kurz: "Fr", lang: "Freitag" },
  { value: 6, kurz: "Sa", lang: "Samstag" },
  { value: 0, kurz: "So", lang: "Sonntag" },
];

export const defaultWiederkehrendDetails: WiederkehrendDetails = {
  rhythmus: "monatlich",
  wochentage: [1, 2, 3, 4, 5],
  proMonat: undefined,
};

/** Erzeugt den lesbaren Tag „Mo–Fr · 5× wöchentlich" oder „2× monatlich". */
export function formatWiederkehrend(d: WiederkehrendDetails): string {
  const tage = [...d.wochentage].sort((a, b) => {
    // Montag-Sortierung: Mo=1…So=0 → 7
    const norm = (n: number) => (n === 0 ? 7 : n);
    return norm(a) - norm(b);
  });

  if (d.rhythmus === "woechentlich") {
    if (tage.length === 0) return "Wöchentlich";
    // Zusammenhängende Mo–Fr-Erkennung
    const istMoFr =
      tage.length === 5 &&
      tage[0] === 1 &&
      tage[1] === 2 &&
      tage[2] === 3 &&
      tage[3] === 4 &&
      tage[4] === 5;
    if (istMoFr) return "Mo–Fr · 5× wöchentlich";
    const labels = tage.map((t) => WOCHENTAGE.find((w) => w.value === t)?.kurz ?? "").filter(Boolean);
    return `${labels.join(", ")} · ${tage.length}× wöchentlich`;
  }
  if (d.rhythmus === "monatlich") {
    return d.proMonat && d.proMonat > 1 ? `${d.proMonat}× monatlich` : "Monatlich";
  }
  if (d.rhythmus === "quartalsweise") return "Quartalsweise";
  return "Jährlich";
}

export function DauerauftragKonfig({ value, onChange }: Props) {
  function set<K extends keyof WiederkehrendDetails>(k: K, v: WiederkehrendDetails[K]) {
    onChange({ ...value, [k]: v });
  }
  function toggleTag(t: number) {
    const has = value.wochentage.includes(t);
    set("wochentage", has ? value.wochentage.filter((x) => x !== t) : [...value.wochentage, t]);
  }

  return (
    <div className="space-y-4 rounded-2xl border border-primary/30 bg-primary/[0.04] p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <CalendarClock className="h-4 w-4 text-primary" />
        Dauerauftrag-Konfiguration
      </div>

      {/* Rhythmus */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Rhythmus
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {RHYTHMEN.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => set("rhythmus", r.value)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-medium transition",
                value.rhythmus === r.value
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-background text-foreground hover:bg-muted",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Wochentage */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {value.rhythmus === "woechentlich" ? "Wochentage *" : "Wochentage (optional)"}
        </p>
        <div className="flex flex-wrap gap-2">
          {WOCHENTAGE.map((w) => {
            const active = value.wochentage.includes(w.value);
            return (
              <button
                key={w.value}
                type="button"
                onClick={() => toggleTag(w.value)}
                className={cn(
                  "h-10 min-w-12 rounded-lg border px-3 text-sm font-semibold transition",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                aria-pressed={active}
                title={w.lang}
              >
                {w.kurz}
              </button>
            );
          })}
        </div>
      </div>

      {/* Häufigkeit pro Monat — optional, sinnvoll bei „monatlich" */}
      {value.rhythmus === "monatlich" && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Häufigkeit pro Monat (optional)
          </p>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => set("proMonat", value.proMonat === n ? undefined : n)}
                className={cn(
                  "h-9 rounded-lg border px-3 text-sm font-medium transition",
                  value.proMonat === n
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {n}× monatlich
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">Vorschau · </span>
        <span className="font-semibold">{formatWiederkehrend(value)}</span>
      </div>
    </div>
  );
}
