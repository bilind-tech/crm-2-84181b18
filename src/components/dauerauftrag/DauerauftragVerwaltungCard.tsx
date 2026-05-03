import { Link } from "@tanstack/react-router";
import { Repeat, Pause, Play, Square, Zap, CheckCircle2, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  useDauerauftrag,
  useDauerauftragLaeufe,
  usePausiereDauerauftrag,
  useBeendeDauerauftrag,
  useSofortLauf,
} from "@/hooks/useDauerauftraege";
import { useRechnungen } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/hooks/useConfirm";
import { berechneNaechsteLauftermine } from "@/lib/dauerauftrag/termine";
import { formatDate } from "@/lib/format";
import { formatWiederkehrend } from "@/components/forms/DauerauftragKonfig";
import type { WiederkehrendDetails } from "@/lib/api/types";

type Props = {
  /** ID der aktuellen Rechnung — wird verwendet, um den verknüpften Dauerauftrag zu finden. */
  rechnungId?: string;
  /** Fallback: Zeige nur die Info-Zeile (kein Dauerauftrag verknüpft, z. B. Angebot). */
  details?: WiederkehrendDetails;
};

/**
 * Verwaltungs-Card für Daueraufträge auf Rechnungs-/Angebot-Detailseiten.
 * Findet über die Lauf-Liste den verknüpften Dauerauftrag und zeigt:
 * - nächster Lauftermin, Modus, Status
 * - Aktionen: Pausieren / Fortsetzen, Beenden, Sofort erzeugen
 * - Letzte 3 Läufe mit Bezahlt-Status
 *
 * Wenn keine Rechnung verknüpft ist (z. B. Angebot ohne Folge-Rechnung), wird
 * nur die einfache Info-Zeile mit Rhythmus angezeigt.
 */
export function DauerauftragVerwaltungCard({ rechnungId, details }: Props) {
  const { data: alleLaeufe = [] } = useDauerauftragLaeufe();
  const { data: alleRechnungen = [] } = useRechnungen();

  const meinLauf = rechnungId ? alleLaeufe.find((l) => l.rechnungId === rechnungId) : undefined;
  const dauerauftragId = meinLauf?.dauerauftragId;

  if (!dauerauftragId) {
    // Kein verknüpfter Dauerauftrag — nur Info-Zeile.
    return (
      <div className="flex items-center gap-1.5 text-sm text-foreground">
        <Repeat className="h-3.5 w-3.5 text-primary" />
        Dauerauftrag
        {details && <span className="text-muted-foreground">· {formatWiederkehrend(details)}</span>}
      </div>
    );
  }

  return <VerwaltungInner dauerauftragId={dauerauftragId} alleRechnungen={alleRechnungen} />;
}

function VerwaltungInner({
  dauerauftragId,
  alleRechnungen,
}: {
  dauerauftragId: string;
  alleRechnungen: ReturnType<typeof useRechnungen>["data"] extends infer T
    ? Exclude<T, undefined>
    : never;
}) {
  const { data: da } = useDauerauftrag(dauerauftragId);
  const pausiere = usePausiereDauerauftrag(dauerauftragId);
  const beende = useBeendeDauerauftrag(dauerauftragId);
  const sofort = useSofortLauf(dauerauftragId);
  const { confirm, dialog } = useConfirm();

  if (!da) return null;

  const heute = new Date();
  const naechste = berechneNaechsteLauftermine(da, heute, 1)[0];
  const istPausiert = da.status === "pausiert";
  const istBeendet = da.status === "beendet";

  // Letzte 3 Läufe (neueste zuerst)
  const letzteLaeufe = [...da.laeufe]
    .sort((a, b) => (a.geplantFuer < b.geplantFuer ? 1 : -1))
    .slice(0, 3);

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Repeat className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Dauerauftrag · {da.frequenz}</p>
            <p className="text-[11px] text-muted-foreground">
              <span className="font-mono">{da.nummer}</span> ·{" "}
              {da.modus === "vollautomatisch" ? "vollautomatisch" : "Entwurf zur Freigabe"}
            </p>
          </div>
        </div>
        <StatusBadge status={da.status} />
      </div>

      <div className="mb-3 grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-background p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Nächster Lauf
          </p>
          <p className="mt-0.5 font-medium">
            {istBeendet ? "—" : naechste ? formatDate(naechste.toISOString().slice(0, 10)) : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Bisherige Läufe
          </p>
          <p className="mt-0.5 font-medium">{da.laeufe.length}</p>
        </div>
      </div>

      {!istBeendet && (
        <div className="mb-3 flex flex-wrap gap-2">
          {istPausiert ? (
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg"
              onClick={() =>
                pausiere.mutate(null, {
                  onSuccess: () => toast.success("Dauerauftrag fortgesetzt"),
                })
              }
            >
              <Play className="mr-1.5 h-3.5 w-3.5" /> Fortsetzen
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg"
              onClick={() =>
                pausiere.mutate(null, {
                  onSuccess: () => toast.success("Dauerauftrag pausiert"),
                })
              }
            >
              <Pause className="mr-1.5 h-3.5 w-3.5" /> Pausieren
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="rounded-lg"
            onClick={() =>
              sofort.mutate(undefined, {
                onSuccess: () => toast.success("Sofort-Lauf erzeugt"),
                onError: (e) =>
                  toast.error(e instanceof Error ? e.message : "Fehler beim Sofort-Lauf"),
              })
            }
          >
            <Zap className="mr-1.5 h-3.5 w-3.5" /> Sofort erzeugen
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-lg text-destructive hover:bg-destructive/10"
            onClick={() =>
              confirm(
                {
                  title: "Dauerauftrag beenden?",
                  description: `${da.nummer} · ${da.bezeichnung} wird beendet. Es werden keine weiteren Rechnungen automatisch erzeugt.`,
                  variant: "destructive",
                  confirmLabel: "Beenden",
                },
                () =>
                  beende.mutate(undefined, {
                    onSuccess: () => toast.success("Dauerauftrag beendet"),
                  }),
              )
            }
          >
            <Square className="mr-1.5 h-3.5 w-3.5" /> Beenden
          </Button>
        </div>
      )}

      {letzteLaeufe.length > 0 && (
        <div className="mb-3 rounded-lg border border-border bg-background">
          <p className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Letzte Läufe
          </p>
          <ul className="divide-y divide-border">
            {letzteLaeufe.map((l) => {
              const r = l.rechnungId
                ? alleRechnungen.find((rr) => rr.id === l.rechnungId)
                : undefined;
              return (
                <li key={l.id}>
                  {r ? (
                    <Link
                      to="/rechnungen/$id"
                      params={{ id: r.id }}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="font-medium">{l.periode}</p>
                          <p className="text-[10px] text-muted-foreground">
                            <span className="font-mono">{r.nummer}</span> · Stichtag{" "}
                            {formatDate(l.geplantFuer)}
                          </p>
                        </div>
                      </div>
                      <RechnungStatusPill status={r.status} />
                    </Link>
                  ) : (
                    <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="font-medium">{l.periode}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Stichtag {formatDate(l.geplantFuer)}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] capitalize text-muted-foreground">
                        {l.status}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        <CheckCircle2 className="mr-1 inline h-3 w-3" />
        Jeder Monat ist eine eigene Rechnung — bezahlt-Markierung erfolgt pro Monat in der
        jeweiligen Rechnung.
      </p>

      {dialog}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    aktiv: "bg-success/10 text-success border-success/20",
    pausiert: "bg-warning/10 text-warning border-warning/20",
    beendet: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${
        map[status] ?? map.beendet
      }`}
    >
      {status}
    </span>
  );
}

function RechnungStatusPill({ status }: { status: string }) {
  const label: Record<string, string> = {
    entwurf: "Entwurf",
    versendet: "Versendet",
    teilbezahlt: "Teilbez.",
    bezahlt: "Bezahlt",
    ueberfaellig: "Überfällig",
    storniert: "Storniert",
  };
  const map: Record<string, string> = {
    entwurf: "bg-muted text-foreground/70 border-border",
    versendet: "bg-primary/10 text-primary border-primary/20",
    teilbezahlt: "bg-warning/10 text-warning border-warning/20",
    bezahlt: "bg-success/10 text-success border-success/20",
    ueberfaellig: "bg-destructive/10 text-destructive border-destructive/20",
    storniert: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
        map[status] ?? map.entwurf
      }`}
    >
      {label[status] ?? status}
    </span>
  );
}
