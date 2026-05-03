import { Cloud, CloudOff, AlertTriangle, Loader2, ExternalLink } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import type { Dokument } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

export type DriveState = "synced" | "pending" | "error" | "none";

export function driveState(d: Pick<Dokument, "drive">): DriveState {
  if (!d.drive) return "none";
  if (d.drive.error) return "error";
  if (d.drive.fileId) return "synced";
  return "pending";
}

interface Props {
  dokument: Pick<Dokument, "drive">;
  /** xs = nur Icon, sm = Icon + kurzer Text. */
  size?: "xs" | "sm";
  className?: string;
}

export function DriveSyncBadge({ dokument, size = "xs", className }: Props) {
  const state = driveState(dokument);
  if (state === "none") return null;

  const meta = dokument.drive ?? {};

  const config: Record<
    Exclude<DriveState, "none">,
    {
      Icon: typeof Cloud;
      label: string;
      tooltip: string;
      classes: string;
    }
  > = {
    synced: {
      Icon: Cloud,
      label: "Drive",
      tooltip: meta.syncedAt
        ? `In Google Drive gesichert · ${formatDate(meta.syncedAt.slice(0, 10))}`
        : "In Google Drive gesichert",
      classes: "text-success",
    },
    pending: {
      Icon: Loader2,
      label: "Sync…",
      tooltip: "Wird zu Google Drive synchronisiert…",
      classes: "text-muted-foreground animate-spin",
    },
    error: {
      Icon: AlertTriangle,
      label: "Drive-Fehler",
      tooltip: meta.error
        ? `Drive-Sync fehlgeschlagen: ${meta.error}`
        : "Drive-Sync fehlgeschlagen",
      classes: "text-warning",
    },
  };

  const { Icon, label, tooltip, classes } = config[state];
  const iconSize = size === "xs" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1 ${size === "sm" ? "text-xs" : ""} ${classes} ${className ?? ""}`}
            aria-label={tooltip}
          >
            <Icon className={iconSize} />
            {size === "sm" && <span>{label}</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Größerer Status-Block für Detail-/Footer-Bereiche mit „In Drive öffnen"-Link. */
export function DriveSyncRow({ dokument }: { dokument: Pick<Dokument, "drive"> }) {
  const state = driveState(dokument);
  const meta = dokument.drive;

  const map: Record<DriveState, { Icon: typeof Cloud; text: string; tone: string }> = {
    synced: {
      Icon: Cloud,
      text: meta?.syncedAt
        ? `In Drive gesichert · ${formatDate(meta.syncedAt.slice(0, 10))}`
        : "In Drive gesichert",
      tone: "text-success",
    },
    pending: { Icon: Loader2, text: "Wird synchronisiert…", tone: "text-muted-foreground" },
    error: {
      Icon: AlertTriangle,
      text: meta?.error ? `Sync-Fehler: ${meta.error}` : "Sync-Fehler",
      tone: "text-warning",
    },
    none: { Icon: CloudOff, text: "Noch nicht in Drive", tone: "text-muted-foreground" },
  };

  const { Icon, text, tone } = map[state];

  return (
    <div className="inline-flex items-center gap-2 text-xs">
      <Icon className={`h-4 w-4 ${tone} ${state === "pending" ? "animate-spin" : ""}`} />
      <span className={tone}>{text}</span>
      {state === "synced" && meta?.webViewLink && (
        <a
          href={meta.webViewLink}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-primary hover:underline"
        >
          Öffnen <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
