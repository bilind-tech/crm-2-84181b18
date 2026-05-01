import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Pause, Play, PlayCircle, Square, FileText, Trash2, Repeat } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  useDauerauftrag,
  useSofortLauf,
  usePausiereDauerauftrag,
  useBeendeDauerauftrag,
  useDeleteDauerauftrag,
  useUpdateDauerauftrag,
} from "@/hooks/useDauerauftraege";
import { useKunde } from "@/hooks/useApi";
import {
  berechneNaechsteLauftermine,
  periodeBezeichnung,
  monatlicheBrutto,
} from "@/lib/dauerauftrag/termine";
import { summenRechnung } from "@/lib/mock/backend";
import { formatEUR, formatDate } from "@/lib/format";

export const Route = createFileRoute("/dauerauftraege/$id")({ component: Page });

function Page() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: da } = useDauerauftrag(id);
  const { data: kunde } = useKunde(da?.kundeId ?? "");
  const sofort = useSofortLauf(id);
  const pause = usePausiereDauerauftrag(id);
  const beenden = useBeendeDauerauftrag(id);
  const update = useUpdateDauerauftrag(id);
  const del = useDeleteDauerauftrag();
  const [showBeendeBestaetigung, setShowBeendeBestaetigung] = useState(false);

  if (!da) return <p className="text-sm text-muted-foreground">Lade …</p>;

  const s = summenRechnung(da.positionen, da.rabattGesamt);
  const heute = new Date();
  const naechste = berechneNaechsteLauftermine(da, heute, 5);
  const mrr = monatlicheBrutto(da, s.brutto);

  const istAktiv = da.status === "aktiv";
  const istPausiert = da.status === "pausiert";
  const istBeendet = da.status === "beendet";

  return (
    <div className="space-y-6">
      <PageHeader
        title={da.bezeichnung}
        subtitle={
          <>
            <span className="font-mono">{da.nummer}</span> · {kunde?.firmenname || `${kunde?.vorname ?? ""} ${kunde?.nachname ?? ""}`.trim() || "—"}{" "}
            · {da.frequenz} · Modus: {da.modus === "vollautomatisch" ? "vollautomatisch" : "Entwurf zur Freigabe"}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link to="/dauerauftraege" className="text-xs text-muted-foreground hover:underline">
              ← Übersicht
            </Link>
            {!istBeendet && (
              <Button
                variant="outline"
                className="rounded-lg"
                onClick={() =>
                  sofort.mutate(undefined, {
                    onSuccess: (lauf) => {
                      if (lauf.status === "erzeugt") {
                        toast.success("Lauf erzeugt", {
                          description: lauf.rechnungId ? "Rechnung im Posteingang." : undefined,
                        });
                      } else if (lauf.status === "uebersprungen") {
                        toast.info("Lauf übersprungen", { description: lauf.fehlerGrund });
                      } else {
                        toast.error("Lauf fehlgeschlagen", { description: lauf.fehlerGrund });
                      }
                    },
                  })
                }
                disabled={sofort.isPending}
              >
                <PlayCircle className="mr-1.5 h-4 w-4" /> Jetzt sofort ausführen
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-2 space-y-5">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2"><Repeat className="h-4 w-4 text-primary" /> Fahrplan</h2>
            <p className="text-xs text-muted-foreground">Nächste fünf geplante Läufe.</p>
            <ul className="mt-3 divide-y divide-border">
              {naechste.length === 0 && (
                <li className="py-3 text-sm text-muted-foreground">Keine weiteren Läufe geplant.</li>
              )}
              {naechste.map((d, i) => (
                <li key={i} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{periodeBezeichnung(da, d)}</p>
                    <p className="text-xs text-muted-foreground">Stichtag {formatDate(d.toISOString().slice(0, 10))}</p>
                  </div>
                  <p className="font-semibold">{formatEUR(s.brutto)}</p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold">Lauf-Historie</h2>
            <p className="text-xs text-muted-foreground">Bisher erzeugte Läufe ({da.laeufe.length}).</p>
            {da.laeufe.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Noch kein Lauf — der erste wird zum Stichtag erzeugt.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {[...da.laeufe]
                  .sort((a, b) => b.geplantFuer.localeCompare(a.geplantFuer))
                  .map((l) => (
                    <li key={l.id} className="flex items-center justify-between py-2.5 text-sm">
                      <div>
                        <p className="font-medium">{l.periode}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(l.geplantFuer)}
                          {l.ausgefuehrtAm && ` · ausgeführt ${formatDate(l.ausgefuehrtAm)}`}
                          {l.fehlerGrund && ` · ${l.fehlerGrund}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <LaufStatus status={l.status} />
                        {l.rechnungId && (
                          <Link
                            to="/rechnungen/$id"
                            params={{ id: l.rechnungId }}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <FileText className="h-3 w-3" /> Rechnung
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-semibold">Wert pro Lauf</h3>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">Brutto</span>
              <span className="text-2xl font-bold">{formatEUR(s.brutto)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">≈ pro Monat</span>
              <span className="text-sm font-semibold text-success">{formatEUR(mrr)}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-2.5">
            <h3 className="text-sm font-semibold">Aktionen</h3>
            <div className="flex flex-col gap-2">
              {istAktiv && (
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => pause.mutate(null, { onSuccess: () => toast.success("Pausiert") })}
                >
                  <Pause className="mr-1.5 h-4 w-4" /> Pausieren
                </Button>
              )}
              {istPausiert && (
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() =>
                    update.mutate({ status: "aktiv", pausiertBis: undefined }, {
                      onSuccess: () => toast.success("Wieder aktiv"),
                    })
                  }
                >
                  <Play className="mr-1.5 h-4 w-4" /> Fortsetzen
                </Button>
              )}
              {!istBeendet && (
                <Button
                  variant="outline"
                  className="justify-start text-warning hover:text-warning"
                  onClick={() => setShowBeendeBestaetigung(true)}
                >
                  <Square className="mr-1.5 h-4 w-4" /> Beenden
                </Button>
              )}
              <Button
                variant="outline"
                className="justify-start text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm(`Dauerauftrag ${da.nummer} dauerhaft löschen? Bereits erzeugte Rechnungen bleiben erhalten.`)) {
                    del.mutate(da.id, {
                      onSuccess: () => {
                        toast.success("Gelöscht");
                        navigate({ to: "/dauerauftraege" });
                      },
                    });
                  }
                }}
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> Löschen
              </Button>
            </div>
            {showBeendeBestaetigung && (
              <div className="mt-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs">
                <p className="mb-2 font-medium text-warning">Dauerauftrag wirklich beenden?</p>
                <p className="mb-3 text-muted-foreground">Nach dem Beenden werden keine neuen Rechnungen mehr erzeugt.</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowBeendeBestaetigung(false)}
                  >
                    Abbrechen
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      beenden.mutate(undefined, {
                        onSuccess: () => {
                          toast.success("Beendet");
                          setShowBeendeBestaetigung(false);
                        },
                      })
                    }
                  >
                    Ja, beenden
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LaufStatus({ status }: { status: string }) {
  const map: Record<string, string> = {
    geplant: "bg-muted text-muted-foreground border-border",
    erzeugt: "bg-success/10 text-success border-success/20",
    uebersprungen: "bg-warning/10 text-warning border-warning/20",
    fehler: "bg-destructive/10 text-destructive border-destructive/20",
  };
  const label: Record<string, string> = {
    geplant: "geplant",
    erzeugt: "erzeugt",
    uebersprungen: "übersprungen",
    fehler: "Fehler",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${map[status]}`}>
      {label[status] ?? status}
    </span>
  );
}
