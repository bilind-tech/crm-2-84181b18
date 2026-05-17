import { Cloud, CloudOff, Loader2, AlertCircle } from "lucide-react";
import type { DriveSyncInfo } from "@/lib/api/types";
import { cn } from "@/lib/utils";

interface Props {
  drive?: DriveSyncInfo;
  className?: string;
  /** Kompakter Modus ohne Text — nur Icon. */
  compact?: boolean;
}

export function DriveStatusBadge({ drive, className, compact }: Props) {
  // Wenn KEINE Drive-Info vorliegt, gibt es nichts anzuzeigen — vor allem
  // keinen dauerhaft drehenden „Wird synchronisiert …"-Spinner. Der Status
  // entsteht erst nach einem manuellen E-Mail-Versand, der den Drive-Upload
  // anstößt. Vorher: kein Badge, kein Lärm.
  if (!drive || (!drive.fileId && !drive.error && !drive.ordner)) {
    return null;
  }

  // Status ableiten
  const synced = !!drive?.fileId && !drive.error;
  const failed = !!drive?.error;
  const pending = !drive?.fileId && !drive?.error;

  let icon: React.ReactNode;
  let text: string;
  let tone: string;

  if (synced) {
    icon = <Cloud className="h-3.5 w-3.5" />;
    text = drive?.ordner ? `Auf Drive · ${drive.ordner}` : "Auf Google Drive";
    tone = "text-emerald-600 dark:text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
  } else if (failed) {
    icon = <AlertCircle className="h-3.5 w-3.5" />;
    text = "Sync fehlgeschlagen";
    tone = "text-destructive bg-destructive/10 border-destructive/20";
  } else if (pending) {
    icon = <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    text = "Wird synchronisiert …";
    tone = "text-amber-600 dark:text-amber-500 bg-amber-500/10 border-amber-500/20";
  } else {
    icon = <CloudOff className="h-3.5 w-3.5" />;
    text = "Lokal";
    tone = "text-muted-foreground bg-muted border-border";
  }

  return (
    <span
      title={drive?.error || text}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        tone,
        className,
      )}
    >
      {icon}
      {!compact && <span>{text}</span>}
    </span>
  );
}
