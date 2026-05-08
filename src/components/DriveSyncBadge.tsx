// Kleine, dezente Status-Pille pro Beleg: zeigt an, ob das Beleg-PDF bereits in
// Google Drive synchronisiert ist. Funktioniert auch ohne Drive-Verbindung —
// dann steht dort „Nur lokal · Drive nicht verbunden" + Verbinden-Link.
import { Cloud, CloudOff, CheckCircle2, AlertTriangle, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useDriveUploads, useGoogleDrive, useRetryDriveUpload } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { errorToMessage } from "@/lib/api/piClient";
import { cn } from "@/lib/utils";

interface Props {
  belegArt: "angebot" | "rechnung" | "dokument";
  belegId: string;
  /** Wenn true: kompakte Variante ohne Buttons (für Listen). */
  compact?: boolean;
  className?: string;
}

export function DriveSyncBadge({ belegArt, belegId, compact = false, className }: Props) {
  const { data: drive } = useGoogleDrive();
  const { data: uploads } = useDriveUploads({ belegArt, belegId, limit: 5 });
  const retry = useRetryDriveUpload();

  // Neuester Upload-Versuch zuerst
  const latest = uploads?.[0];
  const verbunden = drive?.verbunden ?? false;

  const handleRetry = async () => {
    if (!latest) return;
    try {
      await retry.mutateAsync(latest.id);
      toast.success("Synchronisation gestartet");
    } catch (err) {
      toast.error(errorToMessage(err, "Synchronisation fehlgeschlagen"));
    }
  };

  // 1) Drive nicht verbunden → freundliche Info + Verbinden-Link
  if (!verbunden) {
    return (
      <Pill
        tone="muted"
        icon={<CloudOff className="h-3.5 w-3.5" />}
        className={className}
      >
        <span>Nur lokal gespeichert</span>
        {!compact && (
          <>
            <span className="text-muted-foreground">·</span>
            <a
              href="/einstellungen?tab=drive"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Drive verbinden
            </a>
          </>
        )}
      </Pill>
    );
  }

  // 2) Verbunden, aber noch kein Upload-Eintrag → Beleg ist noch nicht in
  // Sync-würdigem Status (z. B. Entwurf). Dezenter Hinweis.
  if (!latest) {
    return (
      <Pill tone="muted" icon={<Cloud className="h-3.5 w-3.5" />} className={className}>
        Wird bei Versand synchronisiert
      </Pill>
    );
  }

  // 3) Status-abhängige Darstellung
  switch (latest.status) {
    case "erfolg":
      return (
        <Pill tone="success" icon={<CheckCircle2 className="h-3.5 w-3.5" />} className={className}>
          <span>In Drive</span>
          {!compact && latest.driveWebLink && (
            <a
              href={latest.driveWebLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:opacity-80"
            >
              Öffnen <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </Pill>
      );
    case "pending":
    case "running":
      return (
        <Pill tone="info" icon={<Loader2 className="h-3.5 w-3.5 animate-spin" />} className={className}>
          Synchronisiert…
        </Pill>
      );
    case "fehler":
    case "manuell":
      return (
        <Pill tone="warning" icon={<AlertTriangle className="h-3.5 w-3.5" />} className={className}>
          <span title={latest.fehlerText ?? undefined}>
            Sync fehlgeschlagen
          </span>
          {!compact && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={handleRetry}
              disabled={retry.isPending}
            >
              Erneut
            </Button>
          )}
        </Pill>
      );
  }
}

function Pill({
  tone,
  icon,
  children,
  className,
}: {
  tone: "muted" | "success" | "info" | "warning";
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    muted: "border-border bg-muted/40 text-muted-foreground",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    info: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}