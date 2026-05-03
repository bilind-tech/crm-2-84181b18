// Globaler Drive-Sync-Status-Indikator.
// Aggregiert den Drive-Status aller Dokumente: zeigt auf einen Blick,
// ob alles synchron ist, etwas noch wartet oder ein Upload fehlgeschlagen ist.
// Klick → Einstellungen → Google Drive.
import { Link } from "@tanstack/react-router";
import { Cloud, CloudOff, AlertTriangle, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import type { Dokument } from "@/lib/api/types";
import { driveState } from "./DriveSyncBadge";

interface Props {
  dokumente: Pick<Dokument, "drive">[];
}

export function GlobalDriveSyncBadge({ dokumente }: Props) {
  const stats = { synced: 0, pending: 0, error: 0, none: 0 };
  for (const d of dokumente) stats[driveState(d)] += 1;
  const relevant = stats.synced + stats.pending + stats.error;
  if (relevant === 0) return null;

  let Icon = Cloud;
  let label = "Drive: synchron";
  let tone = "border-success/40 bg-success/5 text-success";
  let detail = `${stats.synced} von ${relevant} Belegen auf Google Drive gespiegelt.`;

  if (stats.error > 0) {
    Icon = AlertTriangle;
    label = `Drive: ${stats.error} Fehler`;
    tone = "border-destructive/40 bg-destructive/5 text-destructive";
    detail = `${stats.error} Belege konnten nicht zu Drive hochgeladen werden.`;
  } else if (stats.pending > 0) {
    Icon = Loader2;
    label = `Drive: ${stats.pending} ausstehend`;
    tone = "border-warning/40 bg-warning/5 text-warning";
    detail = `${stats.pending} Belege werden gerade nach Drive synchronisiert.`;
  } else if (stats.synced === 0) {
    Icon = CloudOff;
    label = "Drive: nicht verbunden";
    tone = "border-border bg-muted text-muted-foreground";
    detail = "Google Drive ist nicht verbunden — Belege werden nicht gespiegelt.";
  }

  const isSpinning = stats.error === 0 && stats.pending > 0;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to="/einstellungen"
            hash="drive"
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition hover:opacity-80 ${tone}`}
          >
            <Icon className={`h-3.5 w-3.5 ${isSpinning ? "animate-spin" : ""}`} />
            <span>{label}</span>
          </Link>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{detail}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Klick öffnet die Drive-Einstellungen.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
