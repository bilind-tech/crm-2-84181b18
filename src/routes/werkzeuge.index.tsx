// Hub-Seite "Werkzeuge" — Sammelseite für PDF-Helfer und kleine Tools.
// Erweiterbar via src/lib/werkzeuge/registry.ts.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Wrench } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { WerkzeugCard } from "@/components/werkzeuge/WerkzeugCard";
import {
  WERKZEUGE,
  WERKZEUG_GRUPPEN,
  type WerkzeugDefinition,
} from "@/lib/werkzeuge/registry";

export const Route = createFileRoute("/werkzeuge/")({ component: WerkzeugeHub });

function WerkzeugeHub() {
  const [q, setQ] = useState("");

  const gefiltert = useMemo<WerkzeugDefinition[]>(() => {
    const term = q.trim().toLowerCase();
    if (!term) return WERKZEUGE;
    return WERKZEUGE.filter(
      (w) =>
        w.titel.toLowerCase().includes(term) ||
        w.beschreibung.toLowerCase().includes(term),
    );
  }, [q]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Werkzeuge"
        subtitle="PDF-Vorlagen und schnelle Helfer für den Alltag. Erweiterbar."
      />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Werkzeug suchen …"
          className="pl-9"
        />
      </div>

      {WERKZEUG_GRUPPEN.map((gruppe) => {
        const items = gefiltert.filter((w) => w.gruppe === gruppe);
        if (items.length === 0 && gruppe !== "Sonstiges") return null;
        return (
          <section key={gruppe} className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              {gruppe}
            </h2>
            {items.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((w) => (
                  <WerkzeugCard key={w.id} werkzeug={w} />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
                <Wrench className="h-4 w-4" />
                Hier kommen weitere Werkzeuge.
              </div>
            )}
          </section>
        );
      })}

      {q && gefiltert.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Kein Werkzeug zu „{q}" gefunden.
        </p>
      )}
    </div>
  );
}
