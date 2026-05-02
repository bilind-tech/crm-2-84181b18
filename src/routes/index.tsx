import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useDashboardKennzahlen,
  useUmsatz,
  useRechnungen,
} from "@/hooks/useApi";
import { useMahnZaehler } from "@/hooks/useMahnZaehler";
import { useDauerauftraege, useDauerauftragLaeufe } from "@/hooks/useDauerauftraege";
import { monatlicheBrutto } from "@/lib/dauerauftrag/termine";
import { summenRechnung } from "@/lib/mock/backend";
import { formatEUR, formatDate } from "@/lib/format";
import {
  Building2,
  ClipboardList,
  Euro,
  FileText,
  Bell,
  CheckCircle2,
  ArrowRight,
  Repeat,
  Inbox,
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
import { NaechsteSchritteCard } from "@/components/dashboard/NaechsteSchritteCard";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const { data: k } = useDashboardKennzahlen();
  const { data: umsatz = [] } = useUmsatz();
  const { data: rechnungen = [] } = useRechnungen();
  const mahn = useMahnZaehler();
  const { data: dauerauftraege = [] } = useDauerauftraege();
  const { data: laeufeErzeugt = [] } = useDauerauftragLaeufe("erzeugt");

  const aktiveDA = dauerauftraege.filter((d) => d.status === "aktiv");
  const mrr = aktiveDA.reduce((sum, da) => {
    const s = summenRechnung(da.positionen, da.rabattGesamt);
    return sum + monatlicheBrutto(da, s.brutto);
  }, 0);
  const offeneDAEntwuerfe = laeufeErzeugt.filter((l) => {
    if (!l.rechnungId) return false;
    const r = rechnungen.find((rr) => rr.id === l.rechnungId);
    return r?.status === "entwurf";
  }).length;

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
        title="Übersicht"
        subtitle="Aktueller Stand auf einen Blick"
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label="Umsatz Monat"
          value={formatEUR(last6[last6.length - 1]?.brutto ?? 0)}
          sublabel="brutto"
          icon={Euro}
          tone="success"
        />
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

      <NaechsteSchritteCard />

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
            <Bell className="h-4 w-4 text-warning" />
            <h2 className="text-base font-semibold">Mahnwesen</h2>
          </div>
          {mahn.aktionEmpfohlen === 0 && mahn.ueberfaellig === 0 ? (
            <div className="py-6 text-center">
              <CheckCircle2 className="mx-auto h-6 w-6 text-success" />
              <p className="mt-2 text-sm text-muted-foreground">
                Keine offenen Mahnvorgänge.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <MahnStat
                value={mahn.aktionEmpfohlen}
                label="Aktion empfohlen"
                tone="primary"
              />
              <MahnStat
                value={mahn.ueberfaellig}
                label="Überfällig"
                tone="warning"
                sub={mahn.offenSumme > 0 ? formatEUR(mahn.offenSumme) : undefined}
              />
              <MahnStat
                value={mahn.inkassoReif}
                label="Inkasso-reif"
                tone={mahn.inkassoReif > 0 ? "danger" : "muted"}
              />
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Daueraufträge</h2>
          </div>
          <Link
            to="/dauerauftraege"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Übersicht öffnen <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {aktiveDA.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Noch keine Daueraufträge.{" "}
            <Link to="/dauerauftraege" className="text-primary hover:underline">
              Jetzt anlegen
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">Aktive Aufträge</p>
              <p className="mt-1 text-2xl font-semibold">{aktiveDA.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">Wiederkehrend / Monat</p>
              <p className="mt-1 text-2xl font-semibold text-success">{formatEUR(mrr)}</p>
            </div>
            <Link
              to="/dauerauftraege/posteingang"
              className={`rounded-xl border p-3 transition hover:bg-muted/40 ${
                offeneDAEntwuerfe > 0
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-muted/30"
              }`}
            >
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Inbox className="h-3 w-3" /> Posteingang
              </p>
              <p className={`mt-1 text-2xl font-semibold ${offeneDAEntwuerfe > 0 ? "text-primary" : ""}`}>
                {offeneDAEntwuerfe}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {offeneDAEntwuerfe > 0 ? "Entwurf zur Freigabe" : "alles erledigt"}
              </p>
            </Link>
          </div>
        )}
      </div>

    </div>
  );
}

function MahnStat({
  value,
  label,
  sub,
  tone,
}: {
  value: number;
  label: string;
  sub?: string;
  tone: "primary" | "warning" | "danger" | "muted";
}) {
  const colorMap = {
    primary: "text-primary",
    warning: "text-warning",
    danger: "text-destructive",
    muted: "text-muted-foreground",
  } as const;
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 text-center">
      <p className={`text-2xl font-semibold ${colorMap[tone]}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{label}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
