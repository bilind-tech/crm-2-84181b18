// Steuer-Übersicht für GmbH (Sankt Augustin) — automatisch + manuelle Zahlungs-Erfassung.
// USt: präzise aus bezahlten Rechnungen + Belegen.
// KSt/Soli/GewSt: YTD-Hochrechnung mit Hinweis.
// Bezahlte Steuern werden vom Empfehlungs-Betrag abgezogen.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Calculator,
  AlertCircle,
  CheckCircle2,
  Receipt,
  FileSpreadsheet,
  Building2,
  Info,
  Plus,
  X,
  CalendarPlus,
  Download,
} from "lucide-react";
import { useRechnungen, useDokumente } from "@/hooks/useApi";
import {
  useSteuerEinstellungen,
  useBezahltMarkierungen,
  useManuellePosten,
  type BezahltMarkierung,
} from "@/lib/steuern/store";
import { generiereAutomatischePosten, berechneKennzahlen } from "@/lib/steuern/berechnung";
import type { SteuerPosten, SteuerArt } from "@/lib/steuern/types";
import { PageHeader, KpiCard } from "@/components/layout/PageHeader";
import { PrimaryAction } from "@/components/layout/PrimaryAction";
import { Button } from "@/components/ui/button";
import { formatEUR, formatDate, daysBetween, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SteuerDetailDialog } from "@/components/steuern/SteuerDetailDialog";
import { SteuerZahlungDialog } from "@/components/steuern/SteuerZahlungDialog";
import { ManuellerPostenDialog } from "@/components/steuern/ManuellerPostenDialog";
import { SteuerExportDialog } from "@/components/steuern/SteuerExportDialog";
import { verfuegbareJahre } from "@/lib/zeitraum/jahre";

export const Route = createFileRoute("/steuern")({
  head: () => ({
    meta: [
      { title: "Steuern — My Clean Center" },
      {
        name: "description",
        content: "Automatische Übersicht über Umsatzsteuer-Schuld und empfohlene Rücklage.",
      },
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

function Page() {
  const { data: rechnungen = [] } = useRechnungen();
  const { data: dokumente = [] } = useDokumente();
  const { data: einstellungen } = useSteuerEinstellungen();
  const { map: bezahltMap, setBezahlt, removeBezahlt } = useBezahltMarkierungen();
  const { posten: manuellePosten } = useManuellePosten();

  const [detailDialog, setDetailDialog] = useState<SteuerPosten | null>(null);
  const [zahlungOpen, setZahlungOpen] = useState(false);
  const [manuellOpen, setManuellOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const aktuellesJahr = new Date().getFullYear();
  // Jahresliste dynamisch: alle Jahre mit realen Daten (Rechnungen, Belege,
  // manuelle Posten) + aktuelles Jahr. Bei Jahreswechsel automatisch neu.
  const [jahr, setJahr] = useState(aktuellesJahr);
  const jahreOptionen = useMemo(() => {
    const quellen: (string | number | undefined)[] = [
      ...rechnungen.map((r) => r.rechnungsdatum),
      ...dokumente.map((d) => d.dokumentdatum),
      ...manuellePosten.map((p) => p.zeitraum.jahr),
    ];
    return verfuegbareJahre(quellen, { sort: "asc" });
  }, [rechnungen, dokumente, manuellePosten]);

  // Automatisch generierte Posten + manuelle Posten + Bezahlt-Overlay
  const allePosten = useMemo<SteuerPosten[]>(() => {
    const auto = generiereAutomatischePosten(rechnungen, dokumente, einstellungen, jahr);
    const manuellJahr = manuellePosten.filter((p) => p.zeitraum.jahr === jahr);
    const merged = [...auto, ...manuellJahr];
    return merged.map((p) => {
      const b = bezahltMap[p.id];
      if (!b) return p;
      return {
        ...p,
        status: "bezahlt" as const,
        bezahltAm: b.bezahltAm,
        tatsaechlicherBetrag: b.tatsaechlicherBetrag,
        notiz: b.notiz ?? p.notiz,
      };
    });
  }, [rechnungen, dokumente, einstellungen, jahr, bezahltMap, manuellePosten]);

  const kennzahlen = useMemo(
    () => berechneKennzahlen(allePosten, rechnungen, dokumente, einstellungen, jahr),
    [allePosten, rechnungen, dokumente, einstellungen, jahr],
  );

  // Aufschlüsselung der Rücklage — nur OFFENE Beträge
  const ruecklage = useMemo(() => {
    let ust = 0;
    let kst = 0;
    let soli = 0;
    let gewst = 0;
    for (const p of allePosten) {
      if (p.status === "bezahlt") continue;
      if (p.art === "ust") ust += p.geschaetzterBetrag;
      else if (p.art === "kst") kst += p.geschaetzterBetrag;
      else if (p.art === "soli") soli += p.geschaetzterBetrag;
      else if (p.art === "gewst") gewst += p.geschaetzterBetrag;
    }
    return {
      ust,
      kst,
      soli,
      gewst,
      ertragsteuer: kst + soli + gewst,
      gesamt: ust + kst + soli + gewst,
    };
  }, [allePosten]);

  const offene = useMemo(
    () =>
      allePosten
        .filter((p) => p.status !== "bezahlt")
        .sort((a, b) => a.faelligAm.localeCompare(b.faelligAm)),
    [allePosten],
  );

  const bezahlte = useMemo(
    () =>
      allePosten
        .filter(
          (p) =>
            p.status === "bezahlt" && p.bezahltAm && new Date(p.bezahltAm).getFullYear() === jahr,
        )
        .sort((a, b) => (b.bezahltAm ?? "").localeCompare(a.bezahltAm ?? "")),
    [allePosten, jahr],
  );

  const offeneUst = offene.filter((p) => p.art === "ust");
  const offeneErtrag = offene.filter((p) => p.art !== "ust" && p.art !== "manuell");
  const offeneManuell = offene.filter((p) => p.art === "manuell");

  function handleZahlungSpeichern(postenId: string, eintrag: BezahltMarkierung) {
    setBezahlt(postenId, eintrag);
  }

  function handleWiderrufen(postenId: string) {
    removeBezahlt(postenId);
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Steuern"
        subtitle="Automatisch aus Rechnungen und Belegen berechnet."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
              <Download className="mr-1.5 h-4 w-4" /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => setManuellOpen(true)}>
              <CalendarPlus className="mr-1.5 h-4 w-4" /> Manueller Termin
            </Button>
            <PrimaryAction
              icon={Plus}
              label="Zahlung erfassen"
              onClick={() => setZahlungOpen(true)}
            />
          </div>
        }
      />

      {/* Jahres-Wechsler */}
      <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 w-fit">
        {jahreOptionen.map((j) => (
          <button
            key={j}
            type="button"
            onClick={() => setJahr(j)}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-lg transition",
              j === jahr
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            {j}
          </button>
        ))}
      </div>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label="Empfohlene Rücklage"
          value={formatEUR(ruecklage.gesamt)}
          sublabel="USt + Ertragsteuer-Schätzung"
          tone="primary"
        />
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
          label={`Bezahlt ${jahr}`}
          value={formatEUR(kennzahlen.bezahltJahrSumme)}
          sublabel={`${bezahlte.length} ${bezahlte.length === 1 ? "Zahlung" : "Zahlungen"} ans Finanzamt`}
          tone="success"
          icon={CheckCircle2}
        />
        <KpiCard
          label={`Gewinn ${jahr}`}
          value={formatEUR(kennzahlen.gewinnYtd)}
          sublabel={kennzahlen.gewinnYtd < 0 ? "Verlust YTD" : "Netto-Einnahmen − Netto-Ausgaben"}
          tone={kennzahlen.gewinnYtd >= 0 ? "default" : "default"}
        />
      </div>

      {/* Rücklagen-Karte: schlicht, ohne Icon */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Empfohlene Rücklage
        </h2>
        <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums">
          {formatEUR(ruecklage.gesamt)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Reicht aus, um alle aktuell offenen Steuerforderungen zu decken.
        </p>

        <div className="mt-6 space-y-2.5 border-t border-border pt-5">
          <RuecklageZeile
            label="Umsatzsteuer-Schuld"
            sub={
              einstellungen.ustPufferSatz > 0
                ? `inkl. ${einstellungen.ustPufferSatz} % Vorsteuer-Puffer für noch nicht erfasste Belege`
                : "ohne Puffer — alle Vorsteuer-Belege müssen erfasst sein"
            }
            betrag={ruecklage.ust}
            ton="schaetzung"
          />
          <RuecklageZeile
            label="Körperschaftsteuer + Soli"
            sub={`${einstellungen.kstSatz} % + ${einstellungen.soliSatz} % auf bisher realisierten Gewinn ${jahr}`}
            betrag={ruecklage.kst + ruecklage.soli}
            ton="schaetzung"
          />
          <RuecklageZeile
            label="Gewerbesteuer"
            sub={`Hebesatz ${einstellungen.gewstHebesatz} % auf bisher realisierten Gewinn ${jahr}`}
            betrag={ruecklage.gewst}
            ton="schaetzung"
          />
          <div className="mt-4 flex items-baseline justify-between border-t border-border pt-3">
            <span className="font-semibold">Gesamt</span>
            <span className="text-2xl font-bold tabular-nums">{formatEUR(ruecklage.gesamt)}</span>
          </div>
        </div>
      </div>

      {/* Offene USt-Voranmeldungen */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Umsatzsteuer
        </h2>
        {offeneUst.length === 0 ? (
          <EmptyHinweis text="Sobald bezahlte Rechnungen oder Belege im aktuellen Voranmeldungs-Zeitraum liegen, erscheint hier die nächste USt-Voranmeldung." />
        ) : (
          <div className="space-y-2">
            {offeneUst.map((p) => (
              <PostenZeile key={p.id} posten={p} onClick={() => setDetailDialog(p)} />
            ))}
          </div>
        )}
      </div>

      {/* Offene Ertragsteuern */}
      {offeneErtrag.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Ertragsteuer-Rücklage · auf bisher realisierten Gewinn
          </h2>
          <div className="space-y-2">
            {offeneErtrag.map((p) => (
              <PostenZeile key={p.id} posten={p} onClick={() => setDetailDialog(p)} />
            ))}
          </div>
        </div>
      )}

      {/* Weitere Steuer-Termine (manuell) */}
      {offeneManuell.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Weitere Steuer-Termine
          </h2>
          <div className="space-y-2">
            {offeneManuell.map((p) => (
              <PostenZeile key={p.id} posten={p} onClick={() => setDetailDialog(p)} />
            ))}
          </div>
        </div>
      )}

      {/* Bereits bezahlt */}
      {bezahlte.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Bereits bezahlt · {jahr}
          </h2>
          <div className="space-y-2">
            {bezahlte.map((p) => (
              <BezahltZeile
                key={p.id}
                posten={p}
                onClick={() => setDetailDialog(p)}
                onWiderrufen={() => handleWiderrufen(p.id)}
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
              USt wird aus bezahlten Rechnungen minus erfasster Vorsteuer berechnet, abzüglich eines
              Puffers für noch nicht erfasste Belege (anpassbar). Ertragsteuern (KSt/Soli/GewSt)
              sind eine Rücklage auf den bisher tatsächlich realisierten Gewinn — nicht auf den
              Umsatz. Mit Steuerberater abstimmen vor Vorauszahlung oder Jahreserklärung.{" "}
              <Link to="/einstellungen" className="font-medium text-primary hover:underline">
                Steuersätze in Einstellungen anpassen
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

      <SteuerDetailDialog
        posten={detailDialog}
        onOpenChange={(v: boolean) => !v && setDetailDialog(null)}
      />
      <SteuerZahlungDialog
        open={zahlungOpen}
        onOpenChange={setZahlungOpen}
        posten={allePosten}
        onSpeichern={handleZahlungSpeichern}
      />
      <ManuellerPostenDialog open={manuellOpen} onOpenChange={setManuellOpen} />
      <SteuerExportDialog open={exportOpen} onOpenChange={setExportOpen} defaultJahr={jahr} />
    </div>
  );
}

function EmptyHinweis({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10 text-success">
        <CheckCircle2 className="h-6 w-6" />
      </div>
      <p className="font-semibold">Keine offenen Posten</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function RuecklageZeile({
  label,
  sub,
  betrag,
  ton,
}: {
  label: string;
  sub: string;
  betrag: number;
  ton: "exakt" | "schaetzung";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium">{label}</p>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              ton === "exakt" ? "bg-success/10 text-success" : "bg-warning/10 text-warning",
            )}
          >
            {ton === "exakt" ? "exakt" : "Schätzung"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <p className="shrink-0 text-lg font-semibold tabular-nums">{formatEUR(betrag)}</p>
    </div>
  );
}

interface ZeileProps {
  posten: SteuerPosten;
  onClick: () => void;
}

function PostenZeile({ posten, onClick }: ZeileProps) {
  const Icon = ART_ICON[posten.art];
  const tageBis = daysBetween(todayISO(), posten.faelligAm);
  const isUeberfaellig = posten.status === "ueberfaellig" || tageBis < 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-sm transition hover:shadow-md sm:p-4"
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          isUeberfaellig
            ? "bg-destructive/10 text-destructive"
            : posten.art === "ust"
              ? "bg-primary/10 text-primary"
              : "bg-warning/10 text-warning",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{posten.titel}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>Fällig {formatDate(posten.faelligAm)}</span>
          <span>·</span>
          <span className={cn(isUeberfaellig && "font-medium text-destructive")}>
            {tageBis < 0
              ? `${Math.abs(tageBis)} Tage überfällig`
              : tageBis === 0
                ? "heute fällig"
                : `in ${tageBis} ${tageBis === 1 ? "Tag" : "Tagen"}`}
          </span>
        </div>
      </div>
      <p
        className={cn(
          "shrink-0 text-base font-semibold tabular-nums sm:text-lg",
          isUeberfaellig && "text-destructive",
        )}
      >
        {formatEUR(posten.geschaetzterBetrag)}
      </p>
    </button>
  );
}

function BezahltZeile({
  posten,
  onClick,
  onWiderrufen,
}: ZeileProps & { onWiderrufen: () => void }) {
  const Icon = ART_ICON[posten.art];
  const betrag = posten.tatsaechlicherBetrag ?? posten.geschaetzterBetrag;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card/50 p-2.5 shadow-sm sm:p-3">
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{posten.titel}</p>
          <p className="truncate text-xs text-muted-foreground">
            Bezahlt {posten.bezahltAm ? formatDate(posten.bezahltAm) : "—"}
            {posten.notiz && ` · ${posten.notiz}`}
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums text-success">
          {formatEUR(betrag)}
        </p>
      </button>
      <Button
        size="icon"
        variant="ghost"
        onClick={onWiderrufen}
        aria-label="Zahlung widerrufen"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
