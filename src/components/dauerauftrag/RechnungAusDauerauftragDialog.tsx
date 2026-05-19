import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Repeat, AlertTriangle, Loader2, Pencil } from "lucide-react";
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
import { periodeFuer, periodeBezeichnung } from "@/lib/dauerauftrag/termine";
import { Label } from "@/components/ui/label";
import { DauerauftragEditDialog } from "@/components/dauerauftrag/DauerauftragEditDialog";
import type { Dauerauftrag, DauerauftragFrequenz } from "@/lib/api/types";

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

/** Liefert die zur Frequenz passende Periode für ein konkretes Datum. */
function periodeFuerDatum(
  frequenz: DauerauftragFrequenz,
  datum: Date,
): { key: string; label: string } {
  const fakeDa = { frequenz } as Dauerauftrag;
  return { key: periodeFuer(fakeDa, datum), label: periodeBezeichnung(fakeDa, datum) };
}

const MONATE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export function RechnungAusDauerauftragDialog({ open, onOpenChange }: Props) {
  const { data: alleDA = [] } = useDauerauftraege();
  const { data: alleLaeufe = [] } = useDauerauftragLaeufe();
  const { data: kunden = [] } = useKunden();
  const bulk = useSofortLaufBulk();
  const navigate = useNavigate();

  const heute = new Date();
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [monat, setMonat] = useState<number>(heute.getMonth()); // 0-11
  const [jahr, setJahr] = useState<number>(heute.getFullYear());
  const [bearbeiten, setBearbeiten] = useState<Dauerauftrag | null>(null);

  const gewaehltesDatum = useMemo(() => new Date(jahr, monat, 1), [jahr, monat]);
  // Jahresliste dynamisch: aktuelles Jahr + 2 Zukunftsjahre + alle Jahre,
  // in denen bereits Läufe existieren (für Rückblick auf reale Vergangenheit).
  // Aufsteigend, damit Auswahl chronologisch wirkt (Vergangenheit oben, Zukunft unten).
  const jahresOptionen = useMemo(
    () => verfuegbareJahre(alleLaeufe.map((l) => l.periode), { zukunftJahre: 2, sort: "asc" }),
    [alleLaeufe],
  );

  const kundeName = (id: string) => {
    const k = kunden.find((x) => x.id === id);
    if (!k) return "—";
    return k.firmenname || `${k.vorname ?? ""} ${k.nachname ?? ""}`.trim() || "—";
  };

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

  const toggleAlle = () =>
    setAuswahl(alleAusgewaehlt ? new Set() : new Set(auswaehlbar.map((d) => d.id)));
  const toggleEinzeln = (id: string) =>
    setAuswahl((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const reset = () => setAuswahl(new Set());

  const handleErzeugen = () => {
    const ids = Array.from(auswahl);
    if (ids.length === 0) return;
    // Für jeden Dauerauftrag wird die zum gewählten Monat/Jahr passende Periode
    // berechnet (Monats-DA → Monat, Quartals-DA → das passende Quartal usw.)
    const ausgewaehlte = sortiert.filter((d) => auswahl.has(d.id));
    Promise.all(
      ausgewaehlte.map((d) =>
        bulk.mutateAsync({
          ids: [d.id],
          periode: periodeFuerDatum(d.frequenz, gewaehltesDatum).key,
        }),
      ),
    )
      .then((results) => {
        const erfolge = results.reduce((a, r) => a + r.erfolge, 0);
        const fehler = results.reduce((a, r) => a + r.fehler, 0);
        const rechnungIds = results.flatMap((r) => r.rechnungIds);
        if (erfolge > 0 && fehler === 0) toast.success(`${erfolge} Rechnung(en) erzeugt`);
        else if (erfolge > 0) toast.warning(`${erfolge} erzeugt, ${fehler} fehlgeschlagen`);
        else toast.error(`Erzeugen fehlgeschlagen (${fehler})`);
        reset();
        onOpenChange(false);
        // Bei genau einer erzeugten Rechnung direkt zur Detailseite springen.
        if (rechnungIds.length === 1) {
          navigate({ to: "/rechnungen/$id", params: { id: rechnungIds[0] } });
        }
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erzeugen fehlgeschlagen"));
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) reset();
          onOpenChange(o);
        }}
      >
        <DialogContent className="bg-background sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-primary" />
              Rechnungen aus Daueraufträgen erzeugen
            </DialogTitle>
            <DialogDescription>
              Wähle Periode und Daueraufträge — für jede ausgewählte Vorlage wird eine Rechnung
              erstellt.
            </DialogDescription>
          </DialogHeader>

          {sortiert.length === 0 ? (
            <div className="rounded-xl border border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
              Noch keine Daueraufträge — leg einen an, indem du beim Anlegen einer Rechnung das
              Häkchen „Wiederkehrend" setzt.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
                <Label className="text-xs font-medium text-muted-foreground">Periode</Label>
                <select
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                  value={monat}
                  onChange={(e) => setMonat(Number(e.target.value))}
                  aria-label="Monat"
                >
                  {MONATE.map((name, idx) => (
                    <option key={idx} value={idx}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                  value={jahr}
                  onChange={(e) => setJahr(Number(e.target.value))}
                  aria-label="Jahr"
                >
                  {jahresOptionen.map((j) => (
                    <option key={j} value={j}>
                      {j}
                    </option>
                  ))}
                </select>
                <span className="ml-auto text-xs text-muted-foreground">
                  Quartals-/Jahres-DA bekommen die passende Periode automatisch
                </span>
              </div>

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
                <span className="text-xs text-muted-foreground">{auswahl.size} ausgewählt</span>
              </div>

              <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto">
                {sortiert.map((da) => {
                  const beendet = da.status === "beendet";
                  const checked = auswahl.has(da.id);
                  const s = summenRechnung(da.positionen, da.rabattGesamt);
                  const periode = periodeFuerDatum(da.frequenz, gewaehltesDatum);
                  const periodeKey = periode.key;
                  const periodeLabel = periode.label;
                  const bereitsErzeugt = alleLaeufe.some(
                    (l) => l.dauerauftragId === da.id && l.periode === periodeKey,
                  );
                  return (
                    <li key={da.id} className="flex items-start gap-2 px-1 py-3">
                      <label
                        className={`flex flex-1 cursor-pointer items-start gap-3 text-sm ${
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
                            <span className="font-medium text-foreground">
                              {formatEUR(s.brutto)}
                            </span>{" "}
                            / Lauf · Periode <span className="font-medium">{periodeLabel}</span>
                          </p>
                          {bereitsErzeugt && !beendet && (
                            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-warning">
                              <AlertTriangle className="h-3 w-3" />
                              bereits erzeugt für {periodeKey}
                            </p>
                          )}
                        </div>
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => setBearbeiten(da)}
                        title="Dauerauftrag bearbeiten"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
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

      {bearbeiten && (
        <DauerauftragEditDialog
          da={bearbeiten}
          onClose={() => setBearbeiten(null)}
        />
      )}
    </>
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
