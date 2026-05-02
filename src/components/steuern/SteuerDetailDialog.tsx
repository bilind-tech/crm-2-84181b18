// Detail-Dialog für einen Steuerposten: Berechnungsgrundlage transparent zeigen.

import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Receipt, FileText } from "lucide-react";
import { useRechnungen, useDokumente, useKunden } from "@/hooks/useApi";
import { formatEUR, formatDate } from "@/lib/format";
import { STEUER_ART_LABEL } from "@/lib/steuern/berechnung";
import type { SteuerPosten } from "@/lib/steuern/types";

interface Props {
  posten: SteuerPosten | null;
  onOpenChange: (open: boolean) => void;
}

export function SteuerDetailDialog({ posten, onOpenChange }: Props) {
  const { data: rechnungen = [] } = useRechnungen();
  const { data: dokumente = [] } = useDokumente();
  const { data: kunden = [] } = useKunden();

  if (!posten) return null;

  const grundlage = posten.berechnungsgrundlage;
  const refRechnungen = grundlage
    ? rechnungen.filter((r) => grundlage.rechnungIds.includes(r.id))
    : [];
  const refDokumente = grundlage
    ? dokumente.filter((d) => grundlage.dokumentIds.includes(d.id))
    : [];

  const kundenMap = new Map(kunden.map((k) => [k.id, k]));

  return (
    <Dialog open={!!posten} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-background">
        <DialogHeader>
          <DialogTitle>{posten.titel}</DialogTitle>
          <DialogDescription>
            {STEUER_ART_LABEL[posten.art]} · Fällig {formatDate(posten.faelligAm)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Betrag-Block */}
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {posten.tatsaechlicherBetrag != null ? "Tatsächlich bezahlt" : "Geschätzter Betrag"}
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight">
              {formatEUR(posten.tatsaechlicherBetrag ?? posten.geschaetzterBetrag)}
            </p>
            {posten.notiz && (
              <p className="mt-2 text-sm text-muted-foreground">{posten.notiz}</p>
            )}
          </div>

          {/* Bezahlt-Info */}
          {posten.status === "bezahlt" && posten.bezahltAm && (
            <div className="rounded-xl border border-success/30 bg-success/5 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-success">
                Zahlung erfasst
              </p>
              <p className="mt-1 text-sm">
                Am {formatDate(posten.bezahltAm)} ans Finanzamt überwiesen
                {posten.tatsaechlicherBetrag != null && posten.tatsaechlicherBetrag !== posten.geschaetzterBetrag && (
                  <> · Schätzung war {formatEUR(posten.geschaetzterBetrag)}</>
                )}
              </p>
            </div>
          )}

          {/* Berechnungsgrundlage */}
          {grundlage && posten.automatisch && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Berechnungsgrundlage
              </p>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                {grundlage.ust != null && (
                  <Row label="USt aus Rechnungen" value={formatEUR(grundlage.ust)} />
                )}
                {grundlage.vorsteuer != null && (
                  <Row label="Vorsteuer aus Belegen" value={`− ${formatEUR(grundlage.vorsteuer)}`} />
                )}
                {grundlage.vorsteuer != null && grundlage.vorsteuer > 0 && (
                  <p className="col-span-full mt-1 text-xs text-muted-foreground">
                    Vorsteuer pro Beleg aus dessen USt-Satz berechnet (Default 19 %).
                  </p>
                )}
                {grundlage.nettoEinnahmen != null && (
                  <Row label="Netto-Einnahmen YTD" value={formatEUR(grundlage.nettoEinnahmen)} />
                )}
                {grundlage.nettoAusgaben != null && (
                  <Row label="Netto-Ausgaben YTD" value={`− ${formatEUR(grundlage.nettoAusgaben)}`} />
                )}
              </div>
            </div>
          )}

          {/* Verknüpfte Rechnungen */}
          {refRechnungen.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {refRechnungen.length} {refRechnungen.length === 1 ? "Rechnung" : "Rechnungen"}
              </p>
              <div className="max-h-48 space-y-1 overflow-auto">
                {refRechnungen.map((r) => {
                  const k = kundenMap.get(r.kundeId);
                  return (
                    <Link
                      key={r.id}
                      to="/rechnungen/$id"
                      params={{ id: r.id }}
                      onClick={() => onOpenChange(false)}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <Receipt className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="font-mono text-xs">{r.nummer}</span>
                      <span className="truncate text-muted-foreground">
                        {k?.firmenname || `${k?.vorname ?? ""} ${k?.nachname ?? ""}`.trim() || "—"}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Verknüpfte Dokumente */}
          {refDokumente.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {refDokumente.length} {refDokumente.length === 1 ? "Beleg" : "Belege"}
              </p>
              <div className="max-h-48 space-y-1 overflow-auto">
                {refDokumente.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{d.titel}</span>
                    {d.betrag != null && (
                      <span className="ml-auto text-muted-foreground">{formatEUR(d.betrag)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-border/50 py-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
