// Liste der letzten Mahn-Läufe (Cron + manuell). Klick → Drill-Down.

import { useState } from "react";
import { Clock, AlertTriangle, History } from "lucide-react";
import { useMahnLaeufe } from "@/hooks/useApi";
import { MahnLaufDetailDialog } from "./MahnLaufDetailDialog";
import { cn } from "@/lib/utils";

function fmtDt(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function MahnLaeufeListe() {
  const { data: laeufe = [], isLoading } = useMahnLaeufe();
  const [openId, setOpenId] = useState<string | null>(null);

  const top10 = laeufe.slice(0, 10);

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Letzte Läufe</h2>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Lade …</p>
      ) : top10.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Läufe.</p>
      ) : (
        <ul className="divide-y divide-border">
          {top10.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => setOpenId(l.id)}
                className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-muted/40"
              >
                <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {fmtDt(l.gestartetAm)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({l.ausgeloestDurch === "cron" ? "Cron" : "manuell"} · {l.modus})
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {l.geprueft} geprüft · {l.vorschlaege} Vorschläge · {l.versendet} versendet
                    {l.uebersprungen > 0 && ` · ${l.uebersprungen} übersprungen`}
                  </p>
                </div>
                {l.fehler > 0 && (
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive",
                    )}
                  >
                    <AlertTriangle className="h-3 w-3" /> {l.fehler}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <MahnLaufDetailDialog
        laufId={openId}
        open={openId !== null}
        onOpenChange={(o) => !o && setOpenId(null)}
      />
    </div>
  );
}
