// Steuer-Übersicht für GmbH (Sankt Augustin).
// Berechnet 3 Hauptsteuern automatisch aus Rechnungen + Dokumenten,
// ergänzt um manuelle Termine. Disclaimer dezent unten.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Calculator,
  AlertCircle,
  Plus,
  CheckCircle2,
  Receipt,
  FileSpreadsheet,
  Building2,
  Trash2,
  Info,
} from "lucide-react";
import { useRechnungen, useDokumente } from "@/hooks/useApi";
import {
  useSteuerEinstellungen,
  useManuellePosten,
  useBezahltMarkierungen,
} from "@/lib/steuern/store";
import {
  generiereAutomatischePosten,
  berechneKennzahlen,
  STEUER_ART_LABEL,
  periodeLabel,
} from "@/lib/steuern/berechnung";
import type { SteuerPosten, SteuerArt } from "@/lib/steuern/types";
import { PageHeader, KpiCard } from "@/components/layout/PageHeader";
import { PrimaryAction } from "@/components/layout/PrimaryAction";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatEUR, formatDate, daysBetween, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ManuellerPostenDialog } from "@/components/steuern/ManuellerPostenDialog";
import { SteuerBezahltDialog } from "@/components/steuern/SteuerBezahltDialog";
import { SteuerDetailDialog } from "@/components/steuern/SteuerDetailDialog";

export const Route = createFileRoute("/steuern")({
  head: () => ({
    meta: [
      { title: "Steuern — My Clean Center" },
      { name: "description", content: "Übersicht über fällige Steuern, Schätzungen und Liquiditätsrücklage." },
    ],
  }),
  component: Page,
});

const ART_ICON: Record<SteuerArt, typeof Receipt> = {
  ust: Receipt,
  kst: Building2,
  soli: FileSpreadsheet,
  gewst: Building2,
  manuell: Calculator,
};

const ART_TONE: Record<SteuerArt, "primary" | "warning" | "danger" | "success" | "default"> = {
  ust: "primary",
  kst: "warning",
  soli: "default",
  gewst: "warning",
  manuell: "default",
};

function Page() {
  const { data: rechnungen = [] } = useRechnungen();
  const { data: dokumente = [] } = useDokumente();
  const { data: einstellungen } = useSteuerEinstellungen();
  const { posten: manuellePosten, remove: removeManuell } = useManuellePosten();
  const { map: bezahltMap, setBezahlt, removeBezahlt } = useBezahltMarkierungen();

  const [neuOpen, setNeuOpen] = useState(false);
  const [bezahltDialog, setBezahltDialog] = useState<SteuerPosten | null>(null);
  const [detailDialog, setDetailDialog] = useState<SteuerPosten | null>(null);

  const jahr = new Date().getFullYear();

  const allePosten = useMemo(() => {
    const auto = generiereAutomatischePosten(rechnungen, dokumente, einstellungen, jahr);
    // Bezahlt-Markierungen aus localStorage anwenden
    const autoMitStatus = auto.map((p) => {
      const b = bezahltMap[p.id];
      if (!b) return p;
      return {
        ...p,
        status: "bezahlt" as const,
        bezahltAm: b.bezahltAm,
        tatsaechlicherBetrag: b.tatsaechlicherBetrag,
      };
    });
    return [...autoMitStatus, ...manuellePosten];
  }, [rechnungen, dokumente, einstellungen, jahr, manuellePosten, bezahltMap]);

  const kennzahlen = useMemo(
    () => berechneKennzahlen(allePosten, rechnungen, dokumente, einstellungen, jahr),
    [allePosten, rechnungen, dokumente, einstellungen, jahr],
  );

  const offene = useMemo(
    () =>
      [...allePosten]
        .filter((p) => p.status !== "bezahlt")
        .sort((a, b) => a.faelligAm.localeCompare(b.faelligAm)),
    [allePosten],
  );

  const bezahlte = useMemo(
    () =>
      [...allePosten]
        .filter((p) => p.status === "bezahlt")
        .sort((a, b) => (b.bezahltAm ?? "").localeCompare(a.bezahltAm ?? "")),
    [allePosten],
  );

  // Aufschlüsselung pro Steuerart (offene Summen)
  const proArt = useMemo(() => {
    const map = new Map<SteuerArt, { summe: number; anzahl: number }>();
    for (const p of offene) {
      const e = map.get(p.art) ?? { summe: 0, anzahl: 0 };
      e.summe += p.geschaetzterBetrag;
      e.anzahl += 1;
      map.set(p.art, e);
    }
    return map;
  }, [offene]);

  const handleBezahlt = (postenId: string, betrag?: number) => {
    if (postenId.startsWith("auto-")) {
      setBezahlt(postenId, { bezahltAm: todayISO(), tatsaechlicherBetrag: betrag });
    }
    // Manuelle Posten werden im Dialog selbst aktualisiert
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Steuern"
        subtitle="GmbH-Steuerübersicht — automatisch aus Rechnungen und Belegen berechnet."
        actions={
          <PrimaryAction
            icon={Plus}
            label="Steuer-Termin anlegen"
            onClick={() => setNeuOpen(true)}
          />
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label="Nächste Fälligkeit"
          value={
            kennzahlen.naechsteFaelligkeit
              ? formatEUR(kennzahlen.naechsteFaelligkeit.geschaetzterBetrag)
              : "—"
          }
          sublabel={
            kennzahlen.naechsteFaelligkeit
              ? `${kennzahlen.naechsteFaelligkeit.titel} · ${formatDate(kennzahlen.naechsteFaelligkeit.faelligAm)}`
              : "Keine offenen Posten"
          }
          tone={kennzahlen.naechsteFaelligkeit?.status === "ueberfaellig" ? "danger" : "warning"}
          icon={AlertCircle}
        />
        <KpiCard
          label="Offen gesamt"
          value={formatEUR(kennzahlen.offenSumme)}
          sublabel={`${offene.length} ${offene.length === 1 ? "Posten" : "Posten"}`}
          tone={kennzahlen.offenSumme > 0 ? "warning" : "default"}
          icon={Calculator}
        />
        <KpiCard
          label={`Bezahlt ${jahr}`}
          value={formatEUR(kennzahlen.bezahltJahrSumme)}
          sublabel={`${bezahlte.length} Posten`}
          tone="success"
          icon={CheckCircle2}
        />
        <KpiCard
          label="Empfohlene Rücklage"
          value={formatEUR(kennzahlen.empfohleneRuecklage)}
          sublabel={`${einstellungen.ruecklageSatz}% vom YTD-Gewinn (${formatEUR(kennzahlen.gewinnYtd)})`}
          tone="primary"
          icon={Building2}
        />
      </div>

      {/* Aufschlüsselung pro Steuerart */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Aufschlüsselung
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(["ust", "kst", "soli", "gewst"] as SteuerArt[]).map((art) => {
            const e = proArt.get(art);
            const Icon = ART_ICON[art];
            return (
              <div
                key={art}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    art === "ust" ? "bg-primary/10 text-primary"
                      : art === "kst" ? "bg-warning/10 text-warning"
                      : art === "gewst" ? "bg-warning/10 text-warning"
                      : "bg-muted text-muted-foreground"
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-muted-foreground">
                      {STEUER_ART_LABEL[art]}
                    </p>
                    <p className="text-base font-semibold">
                      {e ? formatEUR(e.summe) : formatEUR(0)}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {e ? `${e.anzahl} ${e.anzahl === 1 ? "offener Posten" : "offene Posten"}` : "Keine offenen Posten"}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Offene Posten */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Offene Steuern · sortiert nach Fälligkeit
        </h2>
        {offene.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-2">
            {offene.map((p) => (
              <PostenZeile
                key={p.id}
                posten={p}
                onClick={() => setDetailDialog(p)}
                onBezahlt={() => setBezahltDialog(p)}
                onLoeschen={p.id.startsWith("man-") ? () => removeManuell(p.id) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bezahlte Posten */}
      {bezahlte.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Bezahlt · {jahr}
          </h2>
          <div className="space-y-2">
            {bezahlte.map((p) => (
              <PostenZeile
                key={p.id}
                posten={p}
                onClick={() => setDetailDialog(p)}
                onWiderrufen={
                  p.id.startsWith("auto-") ? () => removeBezahlt(p.id) : undefined
                }
                onLoeschen={p.id.startsWith("man-") ? () => removeManuell(p.id) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium text-foreground">Schätzung — keine Steuerberatung</p>
            <p className="mt-1">
              Alle Beträge sind Hochrechnungen aus deinen bezahlten Rechnungen und steuerrelevanten Belegen.
              Mit Steuerberater abstimmen vor Vorauszahlung oder Jahreserklärung.{" "}
              <Link to="/einstellungen" className="font-medium text-primary hover:underline">
                Steuersätze in Einstellungen anpassen
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

      <ManuellerPostenDialog open={neuOpen} onOpenChange={setNeuOpen} />
      <SteuerBezahltDialog
        posten={bezahltDialog}
        onOpenChange={(v) => !v && setBezahltDialog(null)}
        onConfirm={(betrag) => {
          if (bezahltDialog) handleBezahlt(bezahltDialog.id, betrag);
        }}
      />
      <SteuerDetailDialog
        posten={detailDialog}
        onOpenChange={(v) => !v && setDetailDialog(null)}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10 text-success">
        <CheckCircle2 className="h-6 w-6" />
      </div>
      <p className="font-semibold">Keine offenen Steuern</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Sobald bezahlte Rechnungen oder Belege im aktuellen Voranmeldungs-Zeitraum liegen, erscheint hier die nächste USt-Voranmeldung.
      </p>
    </div>
  );
}

interface ZeileProps {
  posten: SteuerPosten;
  onClick: () => void;
  onBezahlt?: () => void;
  onWiderrufen?: () => void;
  onLoeschen?: () => void;
}

function PostenZeile({ posten, onClick, onBezahlt, onWiderrufen, onLoeschen }: ZeileProps) {
  const Icon = ART_ICON[posten.art];
  const tone = ART_TONE[posten.art];
  const tageBis = daysBetween(todayISO(), posten.faelligAm);
  const isUeberfaellig = posten.status === "ueberfaellig" || (posten.status === "offen" && tageBis < 0);
  const isBezahlt = posten.status === "bezahlt";

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm transition hover:shadow-md sm:p-4">
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <div className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          isBezahlt ? "bg-success/10 text-success"
            : isUeberfaellig ? "bg-destructive/10 text-destructive"
            : tone === "primary" ? "bg-primary/10 text-primary"
            : tone === "warning" ? "bg-warning/10 text-warning"
            : "bg-muted text-muted-foreground"
        )}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{posten.titel}</p>
            {!posten.automatisch && (
              <Badge variant="outline" className="h-5 shrink-0 text-[10px]">
                Manuell
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span>Fällig {formatDate(posten.faelligAm)}</span>
            {!isBezahlt && (
              <>
                <span>·</span>
                <span className={cn(isUeberfaellig && "font-medium text-destructive")}>
                  {tageBis < 0
                    ? `${Math.abs(tageBis)} Tage überfällig`
                    : tageBis === 0
                    ? "heute fällig"
                    : `in ${tageBis} ${tageBis === 1 ? "Tag" : "Tagen"}`}
                </span>
              </>
            )}
            {isBezahlt && posten.bezahltAm && (
              <>
                <span>·</span>
                <span className="text-success">bezahlt {formatDate(posten.bezahltAm)}</span>
              </>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className={cn(
            "text-base font-semibold sm:text-lg",
            isBezahlt && "text-success line-through opacity-60",
            isUeberfaellig && !isBezahlt && "text-destructive"
          )}>
            {formatEUR(posten.tatsaechlicherBetrag ?? posten.geschaetzterBetrag)}
          </p>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {onBezahlt && !isBezahlt && (
          <Button
            size="sm"
            onClick={onBezahlt}
            className="rounded-lg"
          >
            <CheckCircle2 className="mr-1 h-4 w-4" /> Bezahlt
          </Button>
        )}
        {onWiderrufen && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onWiderrufen}
            className="rounded-lg text-xs"
          >
            Widerrufen
          </Button>
        )}
        {onLoeschen && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onLoeschen}
            className="rounded-lg text-muted-foreground hover:text-destructive"
            aria-label="Löschen"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
