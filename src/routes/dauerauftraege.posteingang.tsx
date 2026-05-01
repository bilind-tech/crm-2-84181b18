import { createFileRoute, Link } from "@tanstack/react-router";
import { Inbox, FileText, ChevronRight, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useDauerauftragLaeufe, useDauerauftraege } from "@/hooks/useDauerauftraege";
import { useRechnungen } from "@/hooks/useApi";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/dauerauftraege/posteingang")({ component: Page });

function Page() {
  const { data: laeufe = [] } = useDauerauftragLaeufe("erzeugt");
  const { data: alleDA = [] } = useDauerauftraege();
  const { data: rechnungen = [] } = useRechnungen();

  // Nur Läufe, deren Rechnung noch im Status „entwurf" ist (= noch nicht freigegeben).
  const offen = laeufe.filter((l) => {
    if (!l.rechnungId) return false;
    const r = rechnungen.find((rr) => rr.id === l.rechnungId);
    return r && r.status === "entwurf";
  });

  const daById = new Map(alleDA.map((d) => [d.id, d]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Posteingang Daueraufträge"
        subtitle="Erzeugte Rechnungs-Entwürfe aus Daueraufträgen — zur Prüfung und Freigabe."
        actions={
          <Link to="/dauerauftraege" className="text-xs text-muted-foreground hover:underline">
            ← Übersicht
          </Link>
        }
      />

      {offen.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
          <p className="mt-3 text-sm font-medium">Posteingang leer</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Alle Entwürfe wurden freigegeben oder es stehen aktuell keine Läufe an.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm">
            <Inbox className="h-4 w-4 text-primary" />
            <span className="font-medium">{offen.length} Entwurf{offen.length === 1 ? "" : "e"} zur Freigabe</span>
          </div>
          <ul className="divide-y divide-border">
            {offen.map((l) => {
              const da = daById.get(l.dauerauftragId);
              const r = rechnungen.find((rr) => rr.id === l.rechnungId);
              if (!r) return null;
              return (
                <li key={l.id}>
                  <Link
                    to="/rechnungen/$id"
                    params={{ id: r.id }}
                    className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{r.titel}</p>
                        <p className="text-xs text-muted-foreground">
                          {da?.nummer ?? "—"} · {l.periode} · Stichtag {formatDate(l.geplantFuer)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-muted-foreground">
                      <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[10px]">
                        {r.nummer}
                      </span>
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
