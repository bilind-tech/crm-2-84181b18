import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Upload, Receipt } from "lucide-react";
import { useDokumente } from "@/hooks/useApi";
import { formatEUR } from "@/lib/format";
import { PageHeader, KpiCard } from "@/components/layout/PageHeader";
import { PrimaryAction } from "@/components/layout/PrimaryAction";
import { FilterBar } from "@/routes/angebote";

export const Route = createFileRoute("/dokumente")({ component: Page });

function Page() {
  const { data: alle = [] } = useDokumente();
  const [filter, setFilter] = useState("alle");
  const [q, setQ] = useState("");
  const jahr = new Date().getFullYear();

  const counts = useMemo(() => {
    const steuer = alle.filter((d) => d.steuerrelevant && d.dokumentdatum?.startsWith(String(jahr)));
    return {
      gesamt: alle.length,
      quittungen: alle.filter((d) => d.typ === "beleg").length,
      steuerrelevant: steuer.length,
      summe: steuer.reduce((a, d) => a + (d.betrag ?? 0), 0),
    };
  }, [alle, jahr]);

  const filtered = useMemo(() => {
    let list = alle;
    if (filter === "quittungen") list = list.filter((d) => d.typ === "beleg");
    else if (filter === "steuer") list = list.filter((d) => d.steuerrelevant);
    if (q.trim()) {
      const t = q.toLowerCase();
      list = list.filter(
        (d) => d.titel.toLowerCase().includes(t) || d.dateiname.toLowerCase().includes(t)
      );
    }
    return list;
  }, [alle, filter, q]);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Dokumente"
        title="Dokumente"
        subtitle="Quittungen, Rechnungen und steuerrelevante Belege zentral ablegen."
        actions={
          <Button className="h-10 gap-1.5 rounded-full px-5 shadow-sm">
            <Upload className="h-4 w-4" />
            Dokument hochladen
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Dokumente gesamt" value={counts.gesamt} tone="primary" />
        <KpiCard label="Quittungen" value={counts.quittungen} tone="success" />
        <KpiCard label={`Steuerrelevant ${jahr}`} value={counts.steuerrelevant} tone="success" />
        <KpiCard label={`Brutto-Summe ${jahr}`} value={formatEUR(counts.summe)} tone="success" />
      </div>

      <FilterBar
        filter={filter}
        setFilter={setFilter}
        q={q}
        setQ={setQ}
        tabs={[
          { value: "alle", label: "Alle" },
          { value: "quittungen", label: "Quittungen" },
          { value: "eingang", label: "Eingang" },
          { value: "ausgang", label: "Ausgang" },
          { value: "steuer", label: "Steuer" },
        ]}
        placeholder="Suche nach Titel, Dateiname, Beschreibung…"
      />

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-16 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Receipt className="h-7 w-7" />
          </div>
          <p className="text-base font-semibold">Noch keine Dokumente</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Lade deine erste Quittung oder Rechnung hoch.
          </p>
          <Button className="mt-5 h-10 gap-1.5 rounded-full px-5 shadow-sm">
            <Upload className="h-4 w-4" />
            Dokument hochladen
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Titel</th>
                <th className="px-4 py-3 font-medium">Typ</th>
                <th className="px-4 py-3 font-medium">Datum</th>
                <th className="px-4 py-3 text-right font-medium">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{d.titel}</td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{d.typ}</td>
                  <td className="px-4 py-3 text-muted-foreground">{d.dokumentdatum ?? "—"}</td>
                  <td className="px-4 py-3 text-right">{d.betrag ? formatEUR(d.betrag) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
