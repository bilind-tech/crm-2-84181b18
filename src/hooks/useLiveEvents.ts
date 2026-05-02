// Hängt SSE an, mappt Server-Events auf Query-Invalidations + Toasts.
// Wird einmal in Shell mit `useLiveEvents()` gerufen.

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { onSse, startSse } from "@/lib/api/sse";

export function useLiveEvents(enabled: boolean): void {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    startSse();

    const off = onSse(({ type, data }) => {
      switch (type) {
        case "benachrichtigung:neu": {
          qc.invalidateQueries({ queryKey: ["benachrichtigungen"] });
          qc.invalidateQueries({ queryKey: ["aktivitaeten"] });
          const d = data as { prioritaet?: string; titel?: string };
          if (d?.titel) {
            const fn = d.prioritaet === "fehler" ? toast.error
              : d.prioritaet === "warnung" ? toast.warning
              : d.prioritaet === "erfolg" ? toast.success
              : toast.info;
            fn(d.titel);
          }
          break;
        }
        case "benachrichtigung:gelesen":
        case "benachrichtigung:weg":
          qc.invalidateQueries({ queryKey: ["benachrichtigungen"] });
          break;

        case "aktivitaet:neu":
          qc.invalidateQueries({ queryKey: ["aktivitaeten"] });
          break;

        case "beleg:mutated": {
          const d = data as { art?: "angebot" | "rechnung"; id?: string };
          if (d?.art === "rechnung") {
            qc.invalidateQueries({ queryKey: ["rechnungen"] });
            if (d.id) qc.invalidateQueries({ queryKey: ["rechnungen", d.id] });
          } else if (d?.art === "angebot") {
            qc.invalidateQueries({ queryKey: ["angebote"] });
            if (d.id) qc.invalidateQueries({ queryKey: ["angebote", d.id] });
          }
          qc.invalidateQueries({ queryKey: ["dashboard", "kennzahlen"] });
          break;
        }
        case "zahlung:erfasst":
          qc.invalidateQueries({ queryKey: ["rechnungen"] });
          qc.invalidateQueries({ queryKey: ["dashboard", "kennzahlen"] });
          break;

        case "email:gesendet":
        case "email:fehler":
        case "drive:hochgeladen":
        case "drive:fehler":
          qc.invalidateQueries({ queryKey: ["email"] });
          qc.invalidateQueries({ queryKey: ["drive"] });
          qc.invalidateQueries({ queryKey: ["aktivitaeten"] });
          break;

        case "backup:erstellt":
        case "backup:fehler":
          qc.invalidateQueries({ queryKey: ["backups"] });
          break;

        case "mahnung:lauf-fertig": {
          const d = data as { versendet?: number; modus?: string };
          qc.invalidateQueries({ queryKey: ["mahnung"] });
          qc.invalidateQueries({ queryKey: ["rechnungen"] });
          qc.invalidateQueries({ queryKey: ["email"] });
          if (d?.modus === "auto" && (d.versendet ?? 0) > 0) {
            toast.success(`${d.versendet} Mahnung(en) automatisch versendet`);
          }
          break;
        }
        case "mahnung:vorschlag":
        case "mahnung:erstellt":
          qc.invalidateQueries({ queryKey: ["mahnung"] });
          qc.invalidateQueries({ queryKey: ["rechnungen"] });
          break;

        case "einstellung:geaendert": {
          qc.invalidateQueries({ queryKey: ["einstellungen"] });
          const d = data as { key?: string };
          if (d?.key === "steuern") {
            qc.invalidateQueries({ queryKey: ["steuern", "einstellungen"] });
            qc.invalidateQueries({ queryKey: ["steuern", "bezahlt"] });
          } else if (d?.key === "steuern.manuell") {
            qc.invalidateQueries({ queryKey: ["steuern", "manuelle-posten"] });
          } else if (d?.key === "steuern.bezahlt") {
            qc.invalidateQueries({ queryKey: ["steuern", "bezahlt"] });
          }
          break;
        }

        case "system:update:phase":
        case "system:update:lauf": {
          const d = data as { laufId?: string; status?: string; stepId?: string };
          qc.invalidateQueries({ queryKey: ["system", "update", "historie"] });
          qc.invalidateQueries({ queryKey: ["system", "update", "lauf"] });
          if (d?.laufId) qc.invalidateQueries({ queryKey: ["system", "update", "lauf", d.laufId] });
          if (type === "system:update:lauf" && d?.status === "erfolg") {
            toast.success("System-Update installiert");
          } else if (type === "system:update:lauf" && d?.status === "fehler") {
            toast.error("System-Update fehlgeschlagen");
          } else if (type === "system:update:lauf" && d?.status === "rollback") {
            toast.warning("System-Update zurückgerollt");
          }
          break;
        }
      }
    });

    return off;
  }, [enabled, qc]);
}
