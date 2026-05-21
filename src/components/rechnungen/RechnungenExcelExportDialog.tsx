import { useMemo, useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useRechnungen, useKunden } from "@/hooks/useApi";
import type { Kunde, Rechnung } from "@/lib/api/types";

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

/** Brutto-Summe einer Rechnung — analog zur Berechnung in routes/rechnungen.tsx. */
function brutto(r: Rechnung): number {
  let netto = 0;
  let steuer = 0;
  for (const p of r.positionen) {
    const linie =
      p.modus === "pauschal"
        ? (p.pauschalpreisNetto ?? 0) * (1 - p.rabatt / 100)
        : p.menge * p.einzelpreisNetto * (1 - p.rabatt / 100);
    netto += linie;
    steuer += linie * (p.steuersatz / 100);
  }
  return (netto + steuer) * (1 - r.rabattGesamt / 100);
}
function bezahltSumme(r: Rechnung): number {
  return r.zahlungen.reduce((a, z) => a + z.betrag, 0);
}
function kundeName(k: Kunde | undefined): string {
  if (!k) return "—";
  return k.firmenname || `${k.vorname ?? ""} ${k.nachname ?? ""}`.trim() || k.nummer;
}

const STATUS_LABEL: Record<string, string> = {
  entwurf: "Entwurf",
  versendet: "Versendet",
  teilbezahlt: "Teilbezahlt",
  bezahlt: "Bezahlt",
  ueberfaellig: "Überfällig",
  storniert: "Storniert",
};

/** ARGB-Farben für die Status-Zelle (Hintergrund). */
const STATUS_FILL: Record<string, string> = {
  bezahlt: "FFD1FAE5", // grün
  versendet: "FFDBEAFE", // blau
  teilbezahlt: "FFFEF3C7", // gelb
  ueberfaellig: "FFFECACA", // rot
  entwurf: "FFF3F4F6", // grau
  storniert: "FFE5E7EB", // grau
};

export function RechnungenExcelExportDialog({ open, onOpenChange }: Props) {
  const { data: rechnungen = [] } = useRechnungen();
  const { data: kunden = [] } = useKunden();

  // Alle Jahre, in denen mindestens eine Rechnung existiert (absteigend).
  const jahre = useMemo(() => {
    const s = new Set<number>();
    for (const r of rechnungen) {
      const j = Number(r.rechnungsdatum.slice(0, 4));
      if (!Number.isNaN(j)) s.add(j);
    }
    return [...s].sort((a, b) => b - a);
  }, [rechnungen]);

  const [auswahl, setAuswahl] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const alleAn = jahre.length > 0 && jahre.every((j) => auswahl.has(j));
  const toggleAlle = () => setAuswahl(alleAn ? new Set() : new Set(jahre));
  const toggle = (j: number) =>
    setAuswahl((p) => {
      const n = new Set(p);
      n.has(j) ? n.delete(j) : n.add(j);
      return n;
    });

  const kundeById = useMemo(() => {
    const m = new Map<string, Kunde>();
    for (const k of kunden) m.set(k.id, k);
    return m;
  }, [kunden]);

  const handleExport = async () => {
    if (auswahl.size === 0) {
      toast.error("Bitte mindestens ein Jahr auswählen");
      return;
    }
    setBusy(true);
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = "My Clean Center";
      wb.created = new Date();

      const jahreSortiert = [...auswahl].sort((a, b) => a - b);
      for (const jahr of jahreSortiert) {
        const sheet = wb.addWorksheet(String(jahr));
        const headers = [
          "Kunden-Nr.",
          "Kunde",
          "Rechnungs-Nr.",
          "Rechnungsdatum",
          "Fälligkeit",
          "Titel",
          "Brutto (€)",
          "Bezahlt (€)",
          "Offen (€)",
          "Status",
          "Notizen",
        ];
        sheet.addRow(headers);
        // Header-Styling
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
        headerRow.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF1F2937" },
        };
        headerRow.alignment = { vertical: "middle" };
        headerRow.height = 22;

        // Rechnungen dieses Jahres, gruppiert nach Kunde, sortiert nach Datum
        const dieses = rechnungen
          .filter((r) => r.rechnungsdatum.startsWith(`${jahr}-`))
          .sort((a, b) => {
            const ka = kundeName(kundeById.get(a.kundeId));
            const kb = kundeName(kundeById.get(b.kundeId));
            const c = ka.localeCompare(kb, "de");
            return c !== 0 ? c : a.rechnungsdatum.localeCompare(b.rechnungsdatum);
          });

        let summeBrutto = 0;
        let summeBezahlt = 0;
        let summeOffen = 0;

        for (const r of dieses) {
          const k = kundeById.get(r.kundeId);
          const b = brutto(r);
          const bez = bezahltSumme(r);
          const offen = Math.max(0, b - bez);
          summeBrutto += b;
          summeBezahlt += bez;
          summeOffen += offen;

          const row = sheet.addRow([
            k?.nummer ?? "",
            kundeName(k),
            r.nummer,
            r.rechnungsdatum,
            r.faelligkeitsdatum,
            r.titel,
            Number(b.toFixed(2)),
            Number(bez.toFixed(2)),
            Number(offen.toFixed(2)),
            STATUS_LABEL[r.status] ?? r.status,
            r.notizen ?? "",
          ]);

          // Geld-Formatierung
          row.getCell(7).numFmt = '#,##0.00 "€"';
          row.getCell(8).numFmt = '#,##0.00 "€"';
          row.getCell(9).numFmt = '#,##0.00 "€"';

          // Status-Zelle einfärben
          const statusCell = row.getCell(10);
          const fill = STATUS_FILL[r.status];
          if (fill) {
            statusCell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: fill },
            };
            statusCell.font = { bold: true };
          }

          // Komplette Zeile dezent einfärben bei bezahlt / überfällig
          if (r.status === "bezahlt") {
            row.eachCell({ includeEmpty: false }, (cell, col) => {
              if (col === 10) return; // Status-Zelle behält ihre eigene Farbe
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFECFDF5" },
              };
            });
          } else if (r.status === "ueberfaellig") {
            row.eachCell({ includeEmpty: false }, (cell, col) => {
              if (col === 10) return;
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFFEF2F2" },
              };
            });
          }
        }

        // Leerzeile + Summen
        sheet.addRow([]);
        const summary = sheet.addRow([
          "",
          "",
          "",
          "",
          "",
          "Summe",
          Number(summeBrutto.toFixed(2)),
          Number(summeBezahlt.toFixed(2)),
          Number(summeOffen.toFixed(2)),
          "",
          "",
        ]);
        summary.font = { bold: true };
        summary.getCell(7).numFmt = '#,##0.00 "€"';
        summary.getCell(8).numFmt = '#,##0.00 "€"';
        summary.getCell(9).numFmt = '#,##0.00 "€"';

        // Spaltenbreiten
        const widths = [12, 32, 16, 13, 13, 36, 14, 14, 14, 14, 40];
        widths.forEach((w, i) => {
          sheet.getColumn(i + 1).width = w;
        });

        // Erste Zeile einfrieren
        sheet.views = [{ state: "frozen", ySplit: 1 }];

        // AutoFilter über alle Header
        sheet.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: 1, column: headers.length },
        };
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const jahrTeil =
        jahreSortiert.length === 1
          ? String(jahreSortiert[0])
          : `${jahreSortiert[0]}-${jahreSortiert[jahreSortiert.length - 1]}`;
      a.download = `Rechnungen_${jahrTeil}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success("Excel-Datei wurde heruntergeladen");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Rechnungen als Excel exportieren
          </DialogTitle>
          <DialogDescription>
            Wähle ein oder mehrere Jahre — pro Jahr entsteht ein eigenes Tabellenblatt mit allen
            Rechnungen, gruppiert nach Kunde.
          </DialogDescription>
        </DialogHeader>

        {jahre.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            Noch keine Rechnungen vorhanden.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border pb-2">
              <Label className="text-xs font-medium text-muted-foreground">Jahre</Label>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={toggleAlle}
              >
                {alleAn ? "Auswahl aufheben" : "Alle Jahre wählen"}
              </button>
            </div>
            <ul className="max-h-[40vh] divide-y divide-border overflow-y-auto">
              {jahre.map((j) => {
                const anzahl = rechnungen.filter((r) =>
                  r.rechnungsdatum.startsWith(`${j}-`),
                ).length;
                return (
                  <li key={j}>
                    <label className="flex cursor-pointer items-center gap-3 px-1 py-2.5 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border"
                        checked={auswahl.has(j)}
                        onChange={() => toggle(j)}
                      />
                      <span className="font-medium">{j}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {anzahl} Rechnung(en)
                      </span>
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
            disabled={busy}
          >
            Abbrechen
          </Button>
          <Button
            className="rounded-lg"
            onClick={handleExport}
            disabled={busy || auswahl.size === 0 || jahre.length === 0}
          >
            {busy ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Erzeuge …
              </>
            ) : (
              <>Excel herunterladen</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}