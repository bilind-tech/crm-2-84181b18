// Drill-Down-Dialog für einen einzelnen Mahn-Lauf mit Eintragsliste.

import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMahnLauf } from "@/hooks/useApi";
import type { MahnLaufEintrag } from "@/lib/api/types";
import { cn } from "@/lib/utils";

function aktionLabel(a: MahnLaufEintrag["aktion"]): string {
  return a === "vorschlag"
    ? "Vorschlag"
    : a === "versendet"
      ? "Versendet"
      : a === "uebersprungen"
        ? "Übersprungen"
        : "Fehler";
}

function aktionTone(a: MahnLaufEintrag["aktion"]): string {
  return a === "versendet"
    ? "border-success/40 bg-success/10 text-success"
    : a === "fehler"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : a === "vorschlag"
        ? "border-primary/40 bg-primary/10 text-primary"
        : "border-border bg-muted text-muted-foreground";
}

export function MahnLaufDetailDialog({
  laufId,
  open,
  onOpenChange,
}: {
  laufId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data, isLoading } = useMahnLauf(laufId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Mahn-Lauf Details</DialogTitle>
          <DialogDescription>
            {data
              ? `${new Date(data.gestartetAm).toLocaleString("de-DE")} · ${data.ausgeloestDurch} · Modus ${data.modus}`
              : "Lade …"}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Lade …</p>
        ) : data.eintraege.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Keine Einträge — keine Rechnung war fällig.
          </p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 text-left font-medium">Rechnung</th>
                  <th className="py-2 text-left font-medium">Stufe</th>
                  <th className="py-2 text-left font-medium">Aktion</th>
                  <th className="py-2 text-left font-medium">Grund</th>
                </tr>
              </thead>
              <tbody>
                {data.eintraege.map((e) => (
                  <tr key={e.id} className="border-b border-border/60">
                    <td className="py-2 font-mono text-xs">
                      <Link
                        to="/rechnungen/$id"
                        params={{ id: e.rechnungId }}
                        className="text-primary hover:underline"
                        onClick={() => onOpenChange(false)}
                      >
                        {e.rechnungNr ?? e.rechnungId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="py-2">{e.stufe}</td>
                    <td className="py-2">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                          aktionTone(e.aktion),
                        )}
                      >
                        {aktionLabel(e.aktion)}
                      </span>
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">{e.grund ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
