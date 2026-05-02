// Kleiner, dezenter Verbindungs-Indikator unten rechts.
// Grün = verbunden, Rot = nicht erreichbar, Grau pulsierend = wird geprüft.
// Klick öffnet Einstellungen → Backend-Verbindung.
import { Link } from "@tanstack/react-router";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { cn } from "@/lib/utils";

export function BackendStatusIndicator() {
  const { status, url, lastError, health } = useBackendStatus();

  const dotClass =
    status === "connected"
      ? "bg-emerald-500"
      : status === "disconnected"
        ? "bg-rose-500"
        : "bg-muted-foreground animate-pulse";

  const label =
    status === "connected"
      ? `Backend verbunden (v${health?.version ?? "?"})`
      : status === "disconnected"
        ? `Backend nicht erreichbar${lastError ? ` — ${lastError}` : ""}`
        : "Backend wird geprüft …";

  return (
    <Link
      to="/einstellungen"
      title={`${label}\n${url}`}
      className={cn(
        "fixed bottom-3 right-3 z-40 inline-flex items-center gap-1.5 rounded-full",
        "border border-border bg-background/90 px-2.5 py-1 text-[11px] text-muted-foreground",
        "shadow-sm backdrop-blur transition hover:text-foreground",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
      <span className="hidden sm:inline">Backend</span>
    </Link>
  );
}
