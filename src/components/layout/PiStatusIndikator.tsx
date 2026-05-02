// Pi-Status-Indikator: pollt /health auf dem Backend (ohne Auth).
// Drei Zustände: online (grün), wartung (orange), offline (rot).

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { piApi, PiApiError } from "@/lib/api/piClient";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";

interface HealthResponse {
  status: "ok" | "degraded";
  version: string;
  uptimeSec: number;
  maintenance?: boolean;
  db?: { ok: boolean; wal?: boolean; path?: string };
}

type Phase = "loading" | "online" | "wartung" | "offline";

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${m % 60} min`;
  const d = Math.floor(h / 24);
  return `${d} T ${h % 24} h`;
}

export function PiStatusIndikator() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [hadSuccess, setHadSuccess] = useState(false);

  const q = useQuery<HealthResponse>({
    queryKey: ["system", "health"],
    queryFn: async () => {
      try {
        const r = await piApi.get<HealthResponse>("/health");
        setHadSuccess(true);
        return r;
      } catch (e) {
        if (e instanceof PiApiError && e.status === 503) {
          // Wartungsmodus → strukturierte Response erkennen
          return {
            status: "degraded",
            version: "?",
            uptimeSec: 0,
            maintenance: true,
            db: { ok: false },
          };
        }
        throw e;
      }
    },
    refetchInterval: 30_000,
    retry: false,
    staleTime: 25_000,
  });

  let phase: Phase = "loading";
  if (q.isLoading && !hadSuccess) phase = "loading";
  else if (q.isError) phase = "offline";
  else if (q.data?.maintenance) phase = "wartung";
  else if (q.data?.status === "ok") phase = "online";
  else phase = "offline";

  const dotClass = cn(
    "h-2 w-2 shrink-0 rounded-full transition-colors",
    phase === "online" && "bg-success animate-pulse",
    phase === "wartung" && "bg-warning",
    phase === "offline" && "bg-destructive",
    phase === "loading" && "bg-muted-foreground/40",
  );

  const label =
    phase === "online" ? `Online · v${q.data?.version ?? ""}`
    : phase === "wartung" ? "Wartung läuft"
    : phase === "loading" ? "Verbinde…"
    : "Pi nicht erreichbar";

  const tooltip =
    phase === "online" && q.data
      ? `Backend online · v${q.data.version} · Uptime ${formatUptime(q.data.uptimeSec)}`
      : phase === "wartung"
        ? "Backend ist im Wartungsmodus (Restore oder Update läuft)"
        : phase === "offline"
          ? "Backend antwortet nicht. Pi prüfen oder Netzwerk-Verbindung."
          : "Verbindung wird aufgebaut…";

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-muted-foreground",
              "cursor-default select-none",
            )}
            aria-label={label}
          >
            <span className={dotClass} aria-hidden />
            {!collapsed && <span className="truncate">{label}</span>}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
