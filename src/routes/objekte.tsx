import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Plus, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useObjekte } from "@/hooks/useApi";
import { PageHeader, KpiCard } from "@/components/layout/PageHeader";
import { FilterBar } from "@/routes/angebote";
import { SlideOver } from "@/components/ui/slide-over";
import { ObjektForm } from "@/components/forms/ObjektForm";

export const Route = createFileRoute("/objekte")({ component: Page });

function Page() {
  const { data: alle = [] } = useObjekte();
  const [filter, setFilter] = useState("alle");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const counts = useMemo(
    () => ({
      gesamt: alle.length,
      aktiv: alle.filter((o) => o.status === "aktiv").length,
      pausiert: alle.filter((o) => o.status === "pausiert").length,
    }),
    [alle]
  );

  const filtered = useMemo(() => {
    let list = alle;
    if (filter !== "alle") list = list.filter((o) => o.status === filter);
    if (q.trim()) {
      const t = q.toLowerCase();
      list = list.filter((o) => o.name.toLowerCase().includes(t) || o.nummer.toLowerCase().includes(t) || (o.ort ?? "").toLowerCase().includes(t));
    }
    return list;
  }, [alle, filter, q]);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Objekte"
        title="Objekte"
        subtitle="Reinigungsobjekte deiner Kunden mit Frequenz und Zugang."
        actions={
          <Button onClick={() => setOpen(true)} className="h-10 gap-1.5 rounded-full px-5 shadow-sm">
            <Plus className="h-4 w-4" />
            Neues Objekt
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Gesamt" value={counts.gesamt} tone="primary" />
        <KpiCard label="Aktiv" value={counts.aktiv} tone="success" />
        <KpiCard label="Pausiert" value={counts.pausiert} />
      </div>

      <FilterBar
        filter={filter}
        setFilter={setFilter}
        q={q}
        setQ={setQ}
        tabs={[
          { value: "alle", label: "Alle" },
          { value: "aktiv", label: "Aktiv" },
          { value: "pausiert", label: "Pausiert" },
          { value: "beendet", label: "Beendet" },
        ]}
        placeholder="Suche nach Name, Nummer, Ort…"
      />

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-medium">Nummer</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Ort</th>
              <th className="px-4 py-3 font-medium">Frequenz</th>
              <th className="px-4 py-3 text-right font-medium">m²</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{o.nummer}</td>
                <td className="px-4 py-3 font-medium">
                  <Link to="/objekte/$id" params={{ id: o.id }} className="hover:text-primary">{o.name}</Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{o.ort ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground capitalize">{o.frequenz.replace("_", " ")}</td>
                <td className="px-4 py-3 text-right">{o.qmZuReinigen ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <Link to="/objekte/$id" params={{ id: o.id }} className="inline-flex rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Keine Objekte gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SlideOver open={open} onOpenChange={setOpen} title="Neues Objekt">
        <ObjektForm onClose={() => setOpen(false)} />
      </SlideOver>
    </div>
  );
}
