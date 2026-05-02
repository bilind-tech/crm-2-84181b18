import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import {
  ZEITRAUM_ALLE,
  passtInZeitraum,
  zeitraumIstAktiv,
  type ZeitraumState,
} from "@/components/filters/ZeitraumFilter";
import {
  ZeitraumSelect,
  formatZeitraumLabel,
} from "@/components/filters/ZeitraumSelect";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const [zeitraum, setZeitraum] = useState<ZeitraumState>(ZEITRAUM_ALLE);

  const { data: k } = useDashboardKennzahlen(zeitraum);
  const { data: umsatz = [] } = useUmsatz(zeitraum);
  const { data: rechnungen = [] } = useRechnungen();
  const mahn = useMahnZaehler(zeitraumIstAktiv(zeitraum) ? zeitraum : undefined);
  const { data: dauerauftraege = [] } = useDauerauftraege();
  const { data: laeufeErzeugt = [] } = useDauerauftragLaeufe("erzeugt");

  const aktiv = zeitraumIstAktiv(zeitraum);
  const zeitLabel = formatZeitraumLabel(zeitraum);

  const verfuegbareDaten = useMemo(
    () => rechnungen.map((r) => r.rechnungsdatum),
    [rechnungen],
  );

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

  // Offene Rechnungen, optional gefiltert auf Zeitraum
  const offeneAlle = rechnungen.filter(
    (r) =>
      r.status === "versendet" ||
      r.status === "ueberfaellig" ||
      r.status === "teilbezahlt",
  );
  const offene = aktiv
    ? offeneAlle.filter((r) => passtInZeitraum(r.rechnungsdatum, zeitraum))
    : offeneAlle;

  // Umsatz im Zeitraum (brutto-Summe der Punkte)
  const summeZeitraum = umsatz.reduce((acc, u) => acc + u.brutto, 0);

  // Aktueller KPI-Wert "Umsatz" — bei Einzelmonat exakt der Monat,
  // sonst Summe über alle gelieferten Punkte
  const umsatzKpi = aktiv
    ? summeZeitraum
    : umsatz[umsatz.length - 1]?.brutto ?? 0;
  const umsatzKpiSub = aktiv
    ? `brutto · ${zeitLabel}`
    : "brutto · aktueller Monat";

  // Chart-Daten
  const chartData = useMemo(() => {
    const fmt = (k: string) =>
      new Date(k + "-01").toLocaleDateString("de-DE", { month: "short" });
    if (!aktiv) {
      // Letzte 6 Monate
      return umsatz.slice(-6).map((u) => ({ ...u, label: fmt(u.monat) }));
    }
    // Alle gelieferten Punkte (1 oder 12)
    return umsatz.map((u) => ({ ...u, label: fmt(u.monat) }));
  }, [umsatz, aktiv]);

  const chartTitel = aktiv
    ? zeitraum.monat === "alle"
      ? `Umsatz ${zeitraum.jahr}`
      : `Umsatz ${zeitLabel}`
    : "Umsatz";
  const chartSubtitel = aktiv
    ? zeitraum.monat === "alle"
      ? "Monatsverteilung (brutto)"
      : "brutto"
    : "Letzte 6 Monate (brutto)";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Übersicht"
        subtitle={
          aktiv
            ? `Zeitraum: ${zeitLabel}`
            : "Aktueller Stand auf einen Blick"
        }
      />

      {/* Schlichter Zeitraum-Filter — Inline, mobil 50/50 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground sm:hidden">Zeitraum</p>
        <div className="hidden sm:block text-xs font-medium text-muted-foreground">
          Zeitraum
        </div>
        <div className="sm:hidden">
          <ZeitraumSelect
            zeitraum={zeitraum}
            setZeitraum={setZeitraum}
            verfuegbareDaten={verfuegbareDaten}
            size="stretch"
          />
        </div>
        <div className="hidden sm:block">
          <ZeitraumSelect
            zeitraum={zeitraum}
            setZeitraum={setZeitraum}
            verfuegbareDaten={verfuegbareDaten}
            size="inline"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label={aktiv ? "Umsatz Zeitraum" : "Umsatz Monat"}
          value={formatEUR(umsatzKpi)}
          sublabel={umsatzKpiSub}
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
            <h2 className="text-base font-semibold">{chartTitel}</h2>
            <p className="text-xs text-muted-foreground">{chartSubtitel}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Summe</p>
            <p className="text-lg font-semibold">{formatEUR(summeZeitraum)}</p>
          </div>
        </div>
        {aktiv && zeitraum.monat !== "alle" ? (
          // Einzelmonat: kein Diagramm, sondern großer Single-Value-Block
          <div className="mt-4 flex h-64 flex-col items-center justify-center rounded-xl bg-muted/30">
            <p className="text-xs text-muted-foreground">{zeitLabel}</p>
            <p className="mt-1 text-4xl font-semibold text-success">
              {formatEUR(umsatz[0]?.brutto ?? 0)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">brutto</p>
          </div>
        ) : (
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
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
        )}
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
              {aktiv
                ? `Im Zeitraum ${zeitLabel} keine offenen Rechnungen.`
                : "Keine offenen Rechnungen."}
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
                {aktiv
                  ? `Im Zeitraum ${zeitLabel} keine offenen Mahnvorgänge.`
                  : "Keine offenen Mahnvorgänge."}
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
