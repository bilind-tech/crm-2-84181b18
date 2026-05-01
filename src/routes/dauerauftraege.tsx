import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Repeat, Pause, Inbox, Eye, ChevronRight } from "lucide-react";
import { PageHeader, KpiCard } from "@/components/layout/PageHeader";
import { PrimaryAction } from "@/components/layout/PrimaryAction";
import { SlideOver } from "@/components/ui/slide-over";
import { DauerauftragForm } from "@/components/forms/DauerauftragForm";
import { useDauerauftraege, useDauerauftragLaeufe } from "@/hooks/useDauerauftraege";
import { useKunden } from "@/hooks/useApi";
import { berechneNaechsteLauftermine, monatlicheBrutto } from "@/lib/dauerauftrag/termine";
import { summenRechnung } from "@/lib/mock/backend";
import { formatEUR, formatDate } from "@/lib/format";

export const Route = createFileRoute("/dauerauftraege")({ component: Layout });

function Layout() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  // Wenn Detail- oder Posteingang-Sub-Route -> Outlet (Children)
  if (path !== "/dauerauftraege") return <Outlet />;
  return <Liste />;
}

function Liste() {
  const [open, setOpen] = useState(false);
  const { data: alle = [] } = useDauerauftraege();
  const { data: kunden = [] } = useKunden();
  const { data: laeufeErzeugt = [] } = useDauerauftragLaeufe("erzeugt");

  const kundeName = (id: string) => {
    const k = kunden.find((x) => x.id === id);
    if (!k) return "—";
    return k.firmenname || `${k.vorname ?? ""} ${k.nachname ?? ""}`.trim();
  };

  const heute = new Date();

  const stats = useMemo(() => {
    const aktive = alle.filter((d) => d.status === "aktiv");
    let mrr = 0;
    for (const da of aktive) {
      const s = summenRechnung(da.positionen, da.rabattGesamt);
      mrr += monatlicheBrutto(da, s.brutto);
    }
    return {
      aktive: aktive.length,
      pausiert: alle.filter((d) => d.status === "pausiert").length,
      mrr,
      offeneEntwuerfe: laeufeErzeugt.length,
    };
  }, [alle, laeufeErzeugt]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daueraufträge"
        subtitle="Wiederkehrende Rechnungen — automatisch fällig, als Entwurf zur Freigabe oder vollautomatisch versendet."
        actions={<PrimaryAction onClick={() => setOpen(true)} label="Neuer Dauerauftrag" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Aktive Aufträge" value={stats.aktive} icon={Repeat} tone="primary" />
        <KpiCard label="Pausiert" value={stats.pausiert} icon={Pause} />
        <KpiCard label="Wiederkehrender Umsatz" value={formatEUR(stats.mrr)} sublabel="pro Monat (brutto)" tone="success" />
        <KpiCard
          label="Posteingang"
          value={stats.offeneEntwuerfe}
          sublabel={
            stats.offeneEntwuerfe > 0 ? (
              <Link to="/dauerauftraege/posteingang" className="text-primary hover:underline">
                zur Freigabe →
              </Link>
            ) : "Keine offenen Entwürfe"
          }
          icon={Inbox}
          tone={stats.offeneEntwuerfe > 0 ? "danger" : "default"}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-medium">Nr.</th>
              <th className="px-4 py-3 font-medium">Bezeichnung</th>
              <th className="px-4 py-3 font-medium">Kunde</th>
              <th className="px-4 py-3 font-medium">Frequenz</th>
              <th className="px-4 py-3 font-medium">Nächster Lauf</th>
              <th className="px-4 py-3 text-right font-medium">Brutto / Lauf</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {alle.map((da) => {
              const s = summenRechnung(da.positionen, da.rabattGesamt);
              const naechste = berechneNaechsteLauftermine(da, heute, 1)[0];
              return (
                <tr key={da.id} className="border-b border-border last:border-0 transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{da.nummer}</td>
                  <td className="px-4 py-3 font-medium">{da.bezeichnung}</td>
                  <td className="px-4 py-3 text-muted-foreground">{kundeName(da.kundeId)}</td>
                  <td className="px-4 py-3 capitalize">{da.frequenz}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {naechste ? formatDate(naechste.toISOString().slice(0, 10)) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{formatEUR(s.brutto)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={da.status} modus={da.modus} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to="/dauerauftraege/$id"
                      params={{ id: da.id }}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                    >
                      <Eye className="h-3.5 w-3.5" /> Öffnen <ChevronRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {alle.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Noch keine Daueraufträge — <button onClick={() => setOpen(true)} className="text-primary hover:underline">jetzt anlegen</button>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SlideOver
        open={open}
        onOpenChange={setOpen}
        title="Neuer Dauerauftrag"
        description="Wiederkehrende Rechnung mit Frequenz und Stichtag konfigurieren."
      >
        <DauerauftragForm onClose={() => setOpen(false)} />
      </SlideOver>
    </div>
  );
}

function StatusBadge({ status, modus }: { status: string; modus: string }) {
  const map: Record<string, string> = {
    aktiv: "bg-success/10 text-success border-success/20",
    pausiert: "bg-warning/10 text-warning border-warning/20",
    beendet: "bg-muted text-muted-foreground border-border",
  };
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${map[status] ?? map.beendet}`}>
        {status}
      </span>
      <span className="text-[10px] text-muted-foreground">
        {modus === "vollautomatisch" ? "vollautomatisch" : "Entwurf zur Freigabe"}
      </span>
    </div>
  );
}
