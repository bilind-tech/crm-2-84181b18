import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useDashboardKennzahlen, useUmsatz, useRechnungen } from "@/hooks/useApi";
import { useDauerauftragLaeufe } from "@/hooks/useDauerauftraege";
import { useErinnerungen } from "@/hooks/useErinnerungen";
import { formatEUR, formatDate } from "@/lib/format";
import {
  Building2,
  Euro,
  FileText,
  Mail,
  CheckCircle2,
  ArrowRight,
  Inbox,
  Hourglass,
} from "lucide-react";
import { PageHeader, KpiCard } from "@/components/layout/PageHeader";
import { NaechsteSchritteCard } from "@/components/dashboard/NaechsteSchritteCard";
import { UmsatzChartCard } from "@/components/dashboard/UmsatzChartCard";
import {
  ZEITRAUM_ALLE,
  passtInZeitraum,
  zeitraumIstAktiv,
  type ZeitraumState,
} from "@/components/filters/ZeitraumFilter";
import { ZeitraumSelect, formatZeitraumLabel } from "@/components/filters/ZeitraumSelect";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const [zeitraum, setZeitraum] = useState<ZeitraumState>(ZEITRAUM_ALLE);

  const { data: k } = useDashboardKennzahlen(zeitraum);
  const { data: umsatz = [] } = useUmsatz(zeitraum);
  const { data: rechnungen = [] } = useRechnungen();
  const erinnerungen = useErinnerungen();
  const { data: laeufeErzeugt = [] } = useDauerauftragLaeufe("erzeugt");

  const aktiv = zeitraumIstAktiv(zeitraum);
  const zeitLabel = formatZeitraumLabel(zeitraum);

  const verfuegbareDaten = useMemo(() => rechnungen.map((r) => r.rechnungsdatum), [rechnungen]);

  const offeneDAEntwuerfe = laeufeErzeugt.filter((l) => {
    if (!l.rechnungId) return false;
    const r = rechnungen.find((rr) => rr.id === l.rechnungId);
    return r?.status === "entwurf";
  }).length;

  // Offene Rechnungen, optional gefiltert auf Zeitraum
  const offeneAlle = rechnungen.filter(
    (r) => r.status === "versendet" || r.status === "ueberfaellig" || r.status === "teilbezahlt",
  );
  const offene = aktiv
    ? offeneAlle.filter((r) => passtInZeitraum(r.rechnungsdatum, zeitraum))
    : offeneAlle;

  // Aktueller KPI-Wert "Umsatz" — bei Einzelmonat/Zeitraum die Summe der Punkte,
  // sonst der zuletzt gelieferte Monat (aktueller Monat)
  const summeZeitraum = umsatz.reduce((acc, u) => acc + u.brutto, 0);
  const umsatzKpi = aktiv ? summeZeitraum : (umsatz[umsatz.length - 1]?.brutto ?? 0);
  const umsatzKpiSub = aktiv ? `brutto · ${zeitLabel}` : "brutto · aktueller Monat";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Übersicht"
        subtitle={aktiv ? `Zeitraum: ${zeitLabel}` : "Aktueller Stand auf einen Blick"}
      />

      {/* Schlichter Zeitraum-Filter — Inline, mobil 50/50 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground sm:hidden">Zeitraum</p>
        <div className="hidden sm:block text-xs font-medium text-muted-foreground">Zeitraum</div>
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
          label="Ausstehend"
          value={formatEUR(k?.ausstehendEUR ?? 0)}
          sublabel={`${offene.length} ${offene.length === 1 ? "Rechnung offen" : "Rechnungen offen"}`}
          icon={Hourglass}
          tone="warning"
        />
        <KpiCard
          label="Offene Rechnungen"
          value={offene.length}
          sublabel={`${k?.offeneAngebote ?? 0} offene Angebote`}
          icon={FileText}
          tone="danger"
        />
      </div>

      <UmsatzChartCard onMonatKlick={(jahr, monat) => setZeitraum({ jahr, monat })} />

      <NaechsteSchritteCard />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-4 w-4" />
            </span>
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
                    (a, p) =>
                      a +
                      (p.modus === "pauschal"
                        ? (p.pauschalpreisNetto ?? 0) * (1 - p.rabatt / 100)
                        : p.menge * p.einzelpreisNetto * (1 - p.rabatt / 100)),
                    0,
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
                        <p className="text-sm font-medium">
                          {r.nummer} · {r.titel}
                        </p>
                        <p className="text-xs text-muted-foreground">{r.titel}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-right">
                        <div>
                          <p className="text-sm font-semibold">{formatEUR(summe)}</p>
                          <p className="text-[11px] text-muted-foreground">
                            fällig {formatDate(r.faelligkeitsdatum)}
                          </p>
                        </div>
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-success/10 text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </span>
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
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <Mail className="h-4 w-4" />
            </span>
            <h2 className="text-base font-semibold">Zahlungserinnerungen</h2>
          </div>
          {erinnerungen.count === 0 ? (
            <div className="py-6 text-center">
              <span className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-success/10 text-success">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <p className="mt-2 text-sm text-muted-foreground">
                Alles in Ordnung — keine Erinnerung nötig.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted-foreground">
                {erinnerungen.count === 1
                  ? "1 Rechnung ist überfällig und sollte erinnert werden."
                  : `${erinnerungen.count} Rechnungen sind überfällig und sollten erinnert werden.`}{" "}
                Offen gesamt:{" "}
                <span className="font-medium text-foreground">
                  {formatEUR(erinnerungen.gesamtOffen)}
                </span>
              </p>
              <ul className="divide-y divide-border">
                {erinnerungen.eintraege.slice(0, 4).map((e) => (
                  <li key={e.id}>
                    <Link
                      to="/rechnungen/$id"
                      params={{ id: e.id }}
                      className="flex items-center justify-between gap-3 py-2 text-sm hover:text-primary"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-mono text-xs text-muted-foreground">
                          {e.nummer}
                        </span>{" "}
                        · +{e.tageUeber}{" "}
                        {e.tageUeber === 1 ? "Tag" : "Tage"}
                      </span>
                      <span className="shrink-0 font-medium text-warning">
                        {formatEUR(e.offen)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {offeneDAEntwuerfe > 0 && (
        <Link
          to="/rechnungen"
          className="flex items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4 text-sm transition hover:bg-primary/10"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Inbox className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="font-medium">
                {offeneDAEntwuerfe} Rechnungs-Entwurf{offeneDAEntwuerfe === 1 ? "" : "e"} aus
                Daueraufträgen
              </p>
              <p className="text-xs text-muted-foreground">
                Warten auf Freigabe — in der Rechnungsliste mit Filter „Entwurf" sichtbar.
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
        </Link>
      )}
    </div>
  );
}

