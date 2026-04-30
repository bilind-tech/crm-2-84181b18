import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useDashboardKennzahlen,
  useUmsatz,
  useRechnungen,
} from "@/hooks/useApi";
import { formatEUR, formatDate } from "@/lib/format";
import {
  Building2,
  ClipboardList,
  Euro,
  FileText,
  Receipt,
  CheckCircle2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader, KpiCard } from "@/components/layout/PageHeader";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const { data: k } = useDashboardKennzahlen();
  const { data: umsatz = [] } = useUmsatz();
  const { data: rechnungen = [] } = useRechnungen();

  const offene = rechnungen.filter(
    (r) => r.status === "versendet" || r.status === "ueberfaellig" || r.status === "teilbezahlt"
  );

  const summe = umsatz.reduce((acc, u) => acc + u.brutto, 0);

  // Letzte 6 Monate
  const last6 = umsatz.slice(-6).map((u) => ({
    ...u,
    label: new Date(u.monat + "-01").toLocaleDateString("de-DE", { month: "short" }),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb=""
        title="Übersicht"
        subtitle="Aktueller Stand auf einen Blick"
        hint="Hier findest du die wichtigsten Kennzahlen aus deinem Reinigungsbetrieb."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Kunden"
          value={k?.aktiveKunden ?? 0}
          sublabel="aktiv"
          icon={Building2}
          tone="primary"
        />
        <KpiCard
          label="Aufträge"
          value={k?.aktiveObjekte ?? 0}
          sublabel={`${k?.aktiveObjekte ?? 0} Objekte`}
          icon={ClipboardList}
        />
        <KpiCard
          label="Umsatz Monat"
          value={formatEUR(last6[last6.length - 1]?.brutto ?? 0)}
          sublabel="brutto"
          icon={Euro}
          tone="success"
        />
        <KpiCard
          label="Offene Rechnungen"
          value={offene.length}
          sublabel={`${k?.offeneAngebote ?? 0} offene Angebote`}
          icon={FileText}
          tone="danger"
        />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold">Umsatz</h2>
            <p className="text-xs text-muted-foreground">Letzte 6 Monate (brutto)</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Summe</p>
            <p className="text-lg font-semibold">{formatEUR(summe)}</p>
          </div>
        </div>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={last6}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${Math.round(Number(v))} €`}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(v: number) => formatEUR(v)}
              />
              <Bar dataKey="brutto" fill="var(--primary)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Offene Rechnungen</h2>
          </div>
          {offene.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Keine offenen Rechnungen.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {offene.slice(0, 4).map((r) => {
                const summe =
                  r.positionen.reduce(
                    (a, p) => a + p.menge * p.einzelpreisNetto * (1 - p.rabatt / 100),
                    0
                  ) *
                  (1 + r.steuersatz / 100);
                return (
                  <li key={r.id}>
                    <Link
                      to="/rechnungen/$id"
                      params={{ id: r.id }}
                      className="flex items-center justify-between gap-3 py-3 hover:text-primary"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{r.nummer} · {r.titel}</p>
                        <p className="text-xs text-muted-foreground">{r.titel}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-right">
                        <div>
                          <p className="text-sm font-semibold">{formatEUR(summe)}</p>
                          <p className="text-[11px] text-muted-foreground">
                            fällig {formatDate(r.faelligkeitsdatum)}
                          </p>
                        </div>
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Aktive Aufträge</h2>
          </div>
          <p className="py-6 text-center text-sm text-muted-foreground">
            Keine aktiven Aufträge.
          </p>
        </div>
      </div>
    </div>
  );
}
