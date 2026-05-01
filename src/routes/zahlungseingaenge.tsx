import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Upload,
  Plus,
  Inbox,
  CheckCircle2,
  CircleSlash,
  Trash2,
  Wand2,
  Banknote,
  ArrowRight,
} from "lucide-react";
import { PageHeader, KpiCard } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatEUR, formatDate } from "@/lib/format";
import {
  useZahlungseingaenge,
  useDeleteZahlungseingang,
  useIgnoriereZahlungseingang,
  useLoeseZuordnung,
} from "@/hooks/useZahlungseingaenge";
import { useRechnungen } from "@/hooks/useApi";
import { CsvImportDialog } from "@/components/zahlung/CsvImportDialog";
import { ManuellerEingangDialog } from "@/components/zahlung/ManuellerEingangDialog";
import { ZuordnenDialog } from "@/components/zahlung/ZuordnenDialog";
import type { Zahlungseingang, ZahlungseingangStatus } from "@/lib/api/types";

export const Route = createFileRoute("/zahlungseingaenge")({ component: Page });

type Filter = "alle" | ZahlungseingangStatus;

const FILTER_LABELS: Record<Filter, string> = {
  alle: "Alle",
  offen: "Offen",
  zugeordnet: "Zugeordnet",
  teilweise: "Teilweise",
  ignoriert: "Ignoriert",
};

function Page() {
  const { data: alle = [] } = useZahlungseingaenge();
  const { data: rechnungen = [] } = useRechnungen();
  const [filter, setFilter] = useState<Filter>("offen");
  const [csvOffen, setCsvOffen] = useState(false);
  const [manuellOffen, setManuellOffen] = useState(false);
  const [aktiv, setAktiv] = useState<Zahlungseingang | null>(null);

  const loesche = useDeleteZahlungseingang();
  const ignoriere = useIgnoriereZahlungseingang();
  const loeseZuordnung = useLoeseZuordnung();

  const liste = useMemo(() => {
    return alle.filter((z) => filter === "alle" || z.status === filter);
  }, [alle, filter]);

  const offen = alle.filter((z) => z.status === "offen");
  const offenSumme = offen.reduce((a, z) => a + z.betrag, 0);
  const zugeordnet = alle.filter((z) => z.status === "zugeordnet").length;
  const teilweise = alle.filter((z) => z.status === "teilweise").length;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Vertrieb & Abrechnung / Zahlungseingänge"
        title="Zahlungseingänge"
        subtitle="Bank-Umsätze importieren, prüfen und Rechnungen zuordnen."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setManuellOffen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Manuell
            </Button>
            <Button
              className="rounded-full shadow-sm"
              onClick={() => setCsvOffen(true)}
            >
              <Upload className="mr-1.5 h-4 w-4" /> CSV importieren
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Offen"
          value={offen.length}
          sublabel={offen.length > 0 ? formatEUR(offenSumme) : "alles erledigt"}
          icon={Inbox}
          tone={offen.length > 0 ? "primary" : "default"}
        />
        <KpiCard
          label="Zugeordnet"
          value={zugeordnet}
          sublabel="vollständig"
          icon={CheckCircle2}
          tone="success"
        />
        <KpiCard
          label="Teilweise"
          value={teilweise}
          sublabel="Rest offen"
          icon={Wand2}
          tone={teilweise > 0 ? "danger" : "default"}
        />
        <KpiCard
          label="Eingänge"
          value={alle.length}
          sublabel="gesamt"
          icon={Banknote}
        />
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-1 rounded-2xl border border-border bg-card p-2 shadow-sm">
        {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => {
          const count =
            f === "alle" ? alle.length : alle.filter((z) => z.status === f).length;
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition",
                active
                  ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {FILTER_LABELS[f]}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-semibold",
                  active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Liste */}
      <div className="rounded-2xl border border-border bg-card shadow-sm">
        {liste.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Inbox className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Keine Einträge</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {filter === "offen"
                ? "Alle Eingänge sind zugeordnet oder ignoriert."
                : "Importiere Bank-Umsätze als CSV oder erfasse manuell."}
            </p>
            {filter === "offen" && (
              <Button
                className="mt-4 rounded-full"
                onClick={() => setCsvOffen(true)}
                size="sm"
              >
                <Upload className="mr-1.5 h-4 w-4" /> CSV importieren
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {liste.map((z) => (
              <ZeileEingang
                key={z.id}
                eingang={z}
                rechnungenLookup={rechnungen}
                onZuordnen={() => setAktiv(z)}
                onIgnorieren={() =>
                  ignoriere.mutate(z.id, {
                    onSuccess: () => toast.success("Eingang ignoriert"),
                  })
                }
                onLoesen={() =>
                  loeseZuordnung.mutate(z.id, {
                    onSuccess: () => toast.success("Zuordnung gelöst"),
                  })
                }
                onLoeschen={() => {
                  if (confirm("Eingang wirklich löschen? Verknüpfte Zahlungen werden entfernt.")) {
                    loesche.mutate(z.id, {
                      onSuccess: () => toast.success("Eingang gelöscht"),
                    });
                  }
                }}
              />
            ))}
          </ul>
        )}
      </div>

      <CsvImportDialog open={csvOffen} onOpenChange={setCsvOffen} />
      <ManuellerEingangDialog open={manuellOffen} onOpenChange={setManuellOffen} />
      <ZuordnenDialog
        eingang={aktiv}
        open={!!aktiv}
        onOpenChange={(v) => !v && setAktiv(null)}
      />
    </div>
  );
}

function ZeileEingang({
  eingang,
  rechnungenLookup,
  onZuordnen,
  onIgnorieren,
  onLoesen,
  onLoeschen,
}: {
  eingang: Zahlungseingang;
  rechnungenLookup: { id: string; nummer: string }[];
  onZuordnen: () => void;
  onIgnorieren: () => void;
  onLoesen: () => void;
  onLoeschen: () => void;
}) {
  const summeZu = eingang.zuordnungen.reduce((a, z) => a + z.betrag, 0);
  const rest = eingang.betrag - summeZu;

  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <StatusPunkt status={eingang.status} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-base font-semibold">{formatEUR(eingang.betrag)}</span>
            <span className="text-xs text-muted-foreground">
              · {formatDate(eingang.buchungsdatum)}
            </span>
            {eingang.senderName && (
              <span className="text-xs text-muted-foreground">· {eingang.senderName}</span>
            )}
            <StatusBadge status={eingang.status} />
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {eingang.verwendungszweck || "ohne Verwendungszweck"}
          </p>
          {eingang.zuordnungen.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {eingang.zuordnungen.map((zu) => {
                const r = rechnungenLookup.find((rr) => rr.id === zu.rechnungId);
                return (
                  <Link
                    key={zu.zahlungId}
                    to="/rechnungen/$id"
                    params={{ id: zu.rechnungId }}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-primary/10 hover:text-primary"
                  >
                    {r?.nummer ?? "?"} · {formatEUR(zu.betrag)}
                    <ArrowRight className="h-2.5 w-2.5" />
                  </Link>
                );
              })}
              {eingang.status === "teilweise" && (
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
                  Rest {formatEUR(rest)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {eingang.status === "offen" && (
          <>
            <Button size="sm" className="rounded-full" onClick={onZuordnen}>
              <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Zuordnen
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full text-muted-foreground"
              onClick={onIgnorieren}
            >
              <CircleSlash className="mr-1.5 h-3.5 w-3.5" /> Ignorieren
            </Button>
          </>
        )}
        {eingang.status === "teilweise" && (
          <>
            <Button size="sm" className="rounded-full" onClick={onZuordnen}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Weiter zuordnen
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full text-muted-foreground"
              onClick={onLoesen}
            >
              Lösen
            </Button>
          </>
        )}
        {eingang.status === "zugeordnet" && (
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full text-muted-foreground"
            onClick={onLoesen}
          >
            Zuordnung lösen
          </Button>
        )}
        {eingang.status === "ignoriert" && (
          <Button size="sm" variant="ghost" className="rounded-full" onClick={onZuordnen}>
            Doch zuordnen
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={onLoeschen}
          aria-label="Löschen"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}

function StatusPunkt({ status }: { status: ZahlungseingangStatus }) {
  const cls =
    status === "zugeordnet"
      ? "bg-success"
      : status === "teilweise"
        ? "bg-warning"
        : status === "ignoriert"
          ? "bg-muted-foreground/40"
          : "bg-primary";
  return <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", cls)} />;
}

function StatusBadge({ status }: { status: ZahlungseingangStatus }) {
  const map: Record<ZahlungseingangStatus, { label: string; cls: string }> = {
    offen: { label: "Offen", cls: "bg-primary/10 text-primary" },
    zugeordnet: { label: "Zugeordnet", cls: "bg-success/15 text-success" },
    teilweise: { label: "Teilweise", cls: "bg-warning/15 text-warning" },
    ignoriert: { label: "Ignoriert", cls: "bg-muted text-muted-foreground" },
  };
  const m = map[status];
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", m.cls)}>
      {m.label}
    </span>
  );
}
