// Tab "Verlauf": Aktivitätsprotokoll mit Filter.
import { useState, useMemo } from "react";
import { useAktivitaeten } from "@/hooks/useApi";
import { Section } from "./_shared";
import { LoadingPlaceholder } from "@/components/layout/LoadingPlaceholder";
import { cn } from "@/lib/utils";
import type { AktivitaetTyp } from "@/lib/api/types";

const FILTER: { value: "alle" | "einstellungen" | "backup" | "system"; label: string }[] = [
  { value: "alle", label: "Alle" },
  { value: "einstellungen", label: "Einstellungen" },
  { value: "backup", label: "Backups" },
  { value: "system", label: "System" },
];

const SEITE_GROESSE = 50;

function passt(typ: AktivitaetTyp, filter: string): boolean {
  if (filter === "alle") return true;
  if (filter === "einstellungen") return typ === "einstellung_geaendert";
  if (filter === "backup") return typ === "backup_erstellt";
  if (filter === "system") return typ === "system";
  return true;
}

export function VerlaufTab() {
  const { data: list = [], isLoading } = useAktivitaeten();
  const [filter, setFilter] = useState<(typeof FILTER)[number]["value"]>("alle");
  const [seite, setSeite] = useState(0);

  const gefiltert = useMemo(() => list.filter((a) => passt(a.typ, filter)), [list, filter]);
  const sichtbar = gefiltert.slice(seite * SEITE_GROESSE, (seite + 1) * SEITE_GROESSE);
  const seiten = Math.max(1, Math.ceil(gefiltert.length / SEITE_GROESSE));

  if (isLoading) return <LoadingPlaceholder />;

  return (
    <div className="space-y-5 pb-12">
      <Section title="Verlauf" description="Alle Änderungen, Backups und System-Ereignisse.">
        <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-border p-1">
          {FILTER.map((f) => (
            <button
              key={f.value}
              onClick={() => {
                setFilter(f.value);
                setSeite(0);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition",
                filter === f.value
                  ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {sichtbar.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Keine Einträge.</p>
        ) : (
          <ul className="divide-y divide-border">
            {sichtbar.map((a) => (
              <li key={a.id} className="flex items-start gap-3 py-3">
                <span className="mt-1 inline-flex shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                  {a.typ.replaceAll("_", " ")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{a.beschreibung}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(a.zeitpunkt).toLocaleString("de-DE")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {seiten > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              className="rounded-md px-3 py-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
              onClick={() => setSeite((s) => Math.max(0, s - 1))}
              disabled={seite === 0}
            >
              Zurück
            </button>
            <span className="text-xs text-muted-foreground">
              Seite {seite + 1} von {seiten}
            </span>
            <button
              className="rounded-md px-3 py-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
              onClick={() => setSeite((s) => Math.min(seiten - 1, s + 1))}
              disabled={seite >= seiten - 1}
            >
              Weiter
            </button>
          </div>
        )}
      </Section>
    </div>
  );
}
