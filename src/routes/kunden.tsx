import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { useKunden } from "@/hooks/useApi";
import { PageHeader, KpiCard } from "@/components/layout/PageHeader";
import { PrimaryAction } from "@/components/layout/PrimaryAction";
import { FilterBar } from "@/routes/angebote";
import { SlideOver } from "@/components/ui/slide-over";
import { KundeForm } from "@/components/forms/KundeForm";

export const Route = createFileRoute("/kunden")({ component: Page });

function Page() {
  const { data: alle = [] } = useKunden();
  const [filter, setFilter] = useState("alle");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const counts = useMemo(
    () => ({
      gesamt: alle.length,
      aktiv: alle.filter((k) => k.status === "aktiv").length,
      interessent: alle.filter((k) => k.status === "interessent").length,
      inaktiv: alle.filter((k) => k.status === "inaktiv").length,
    }),
    [alle]
  );

  const filtered = useMemo(() => {
    let list = alle;
    if (filter !== "alle") list = list.filter((k) => k.status === filter);
    if (q.trim()) {
      const t = q.toLowerCase();
      list = list.filter(
        (k) =>
          (k.firmenname ?? "").toLowerCase().includes(t) ||
          (k.nachname ?? "").toLowerCase().includes(t) ||
          k.nummer.toLowerCase().includes(t) ||
          (k.ort ?? "").toLowerCase().includes(t)
      );
    }
    return list;
  }, [alle, filter, q]);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Kunden"
        title="Kunden"
        subtitle="Stammdaten deiner Kunden zentral verwalten."
        actions={
          <PrimaryAction onClick={() => setOpen(true)} label="Neuer Kunde" />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Gesamt" value={counts.gesamt} tone="primary" />
        <KpiCard label="Aktiv" value={counts.aktiv} tone="success" />
        <KpiCard label="Interessenten" value={counts.interessent} />
        <KpiCard label="Inaktiv" value={counts.inaktiv} />
      </div>

      <FilterBar
        filter={filter}
        setFilter={setFilter}
        q={q}
        setQ={setQ}
        tabs={[
          { value: "alle", label: "Alle" },
          { value: "aktiv", label: "Aktiv" },
          { value: "interessent", label: "Interessent" },
          { value: "inaktiv", label: "Inaktiv" },
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
              <th className="px-4 py-3 font-medium">E-Mail</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((k) => (
              <tr key={k.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{k.nummer}</td>
                <td className="px-4 py-3 font-medium">
                  <Link to="/kunden/$id" params={{ id: k.id }} className="hover:text-primary">
                    {k.firmenname || `${k.vorname ?? ""} ${k.nachname ?? ""}`.trim()}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{k.ort ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{k.email ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium capitalize">
                    {k.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to="/kunden/$id"
                    params={{ id: k.id }}
                    className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Keine Kunden gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SlideOver
        open={open}
        onOpenChange={setOpen}
        title="Neuer Kunde"
        description="Stammdaten anlegen — vollständige Felder unter den Tabs."
      >
        <KundeForm onClose={() => setOpen(false)} />
      </SlideOver>
    </div>
  );
}
