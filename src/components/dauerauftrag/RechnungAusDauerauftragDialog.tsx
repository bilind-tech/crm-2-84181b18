import { useMemo, useState } from "react";
import { Repeat, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  useDauerauftraege,
  useDauerauftragLaeufe,
  useSofortLaufBulk,
} from "@/hooks/useDauerauftraege";
import { useKunden } from "@/hooks/useApi";
import { summenRechnung } from "@/lib/belege/summen";
import { formatEUR } from "@/lib/format";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Mehrfachauswahl-Dialog: zeigt alle Daueraufträge und erzeugt für die
 * ausgewählten parallel je eine Rechnung (Sofort-Lauf). Beendete sind
 * sichtbar, aber nicht auswählbar. Wenn für die aktuelle Periode bereits
 * ein Lauf existiert, wird ein Warn-Hinweis angezeigt.
 */
export function RechnungAusDauerauftragDialog({ open, onOpenChange }: Props) {
  const { data: alleDA = [] } = useDauerauftraege();
  const { data: alleLaeufe = [] } = useDauerauftragLaeufe();
  const { data: kunden = [] } = useKunden();
  const bulk = useSofortLaufBulk();

  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());

  // Aktuelle Periode (YYYY-MM) — gleiche Notation wie der Backend-Generator
  const heute = new Date();
  const aktuellePeriode = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, "0")}`;

  const kundeName = (id: string) => {
    const k = kunden.find((x) => x.id === id);
    if (!k) return "—";
    return k.firmenname || `${k.vorname ?? ""} ${k.nachname ?? ""}`.trim() || "—";
  };

  // Daueraufträge sortiert: aktiv zuerst, dann pausiert, dann beendet
  const sortiert = useMemo(() => {
    const order: Record<string, number> = { aktiv: 0, pausiert: 1, beendet: 2 };
    return [...alleDA].sort((a, b) => {
      const oa = order[a.status] ?? 3;
      const ob = order[b.status] ?? 3;
      if (oa !== ob) return oa - ob;
      return a.bezeichnung.localeCompare(b.bezeichnung);
    });
  }, [alleDA]);

  const auswaehlbar = sortiert.filter((d) => d.status !== "beendet");
  const alleAusgewaehlt = auswaehlbar.length > 0 && auswaehlbar.every((d) => auswahl.has(d.id));

  const toggleAlle = () => {
    if (alleAusgewaehlt) {
      setAuswahl(new Set());
    } else {
      setAuswahl(new Set(auswaehlbar.map((d) => d.id)));
    }
  };

  const toggleEinzeln = (id: string) => {
    setAuswahl((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reset = () => setAuswahl(new Set());

  const handleErzeugen = () => {
    const ids = Array.from(auswahl);
    if (ids.length === 0) return;
    bulk.mutate(ids, {
      onSuccess: ({ erfolge, fehler }) => {
        if (erfolge > 0 && fehler === 0) {
          toast.success(`${erfolge} Rechnung(en) erzeugt`);
        } else if (erfolge > 0 && fehler > 0) {
          toast.warning(`${erfolge} erzeugt, ${fehler} fehlgeschlagen`);
        } else {
          toast.error(`Erzeugen fehlgeschlagen (${fehler})`);
        }
        reset();
        onOpenChange(false);
      },
      onError: (e) => {
        toast.error(e instanceof Error ? e.message : "Erzeugen fehlgeschlagen");
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="bg-background sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-primary" />
            Rechnungen aus Daueraufträgen erzeugen
          </DialogTitle>
          <DialogDescription>
            Wähle aus, für welche Daueraufträge jetzt eine Rechnung erstellt werden soll.
          </DialogDescription>
        </DialogHeader>

        {sortiert.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            Noch keine Daueraufträge — leg einen an, indem du beim Anlegen einer Rechnung das
            Häkchen „Wiederkehrend" setzt.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border pb-2">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={alleAusgewaehlt}
                  onChange={toggleAlle}
                  disabled={auswaehlbar.length === 0}
                />
                <span className="font-medium">
                  {alleAusgewaehlt ? "Auswahl aufheben" : "Alle auswählen"}
                </span>
              </label>
              <span className="text-xs text-muted-foreground">
                {auswahl.size} ausgewählt
              </span>
            </div>

            <ul className="max-h-[55vh] divide-y divide-border overflow-y-auto">
              {sortiert.map((da) => {
                const beendet = da.status === "beendet";
                const checked = auswahl.has(da.id);
                const s = summenRechnung(da.positionen, da.rabattGesamt);
                const bereitsErzeugt = alleLaeufe.some(
                  (l) => l.dauerauftragId === da.id && l.periode === aktuellePeriode,
                );
                return (
                  <li key={da.id}>
                    <label
                      className={`flex cursor-pointer items-start gap-3 px-1 py-3 text-sm hover:bg-muted/30 ${
                        beendet ? "cursor-not-allowed opacity-50" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
                        checked={checked}
                        disabled={beendet}
                        onChange={() => !beendet && toggleEinzeln(da.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate font-medium">{da.bezeichnung}</p>
                          <StatusPill status={da.status} />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {kundeName(da.kundeId)} ·{" "}
                          <span className="capitalize">{da.frequenz}</span> ·{" "}
                          <span className="font-medium text-foreground">{formatEUR(s.brutto)}</span>{" "}
                          / Lauf
                        </p>
                        {bereitsErzeugt && !beendet && (
                          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-warning">
                            <AlertTriangle className="h-3 w-3" />
                            bereits erzeugt für {aktuellePeriode}
                          </p>
                        )}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            className="rounded-lg"
            onClick={() => onOpenChange(false)}
            disabled={bulk.isPending}
          >
            Abbrechen
          </Button>
          <Button
            className="rounded-lg"
            onClick={handleErzeugen}
            disabled={auswahl.size === 0 || bulk.isPending}
          >
            {bulk.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Erzeuge …
              </>
            ) : (
              <>Erzeugen ({auswahl.size})</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    aktiv: "bg-success/10 text-success border-success/20",
    pausiert: "bg-warning/10 text-warning border-warning/20",
    beendet: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${
        map[status] ?? map.beendet
      }`}
    >
      {status}
    </span>
  );
}
