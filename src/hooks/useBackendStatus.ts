import { useEffect, useState, useSyncExternalStore } from "react";
import {
  fetchHealth,
  getBackendUrl,
  subscribeBackendUrl,
  type HealthInfo,
} from "@/lib/api/backendUrl";

export type BackendStatus = "connected" | "disconnected" | "checking" | "maintenance";

export interface BackendStatusResult {
  status: BackendStatus;
  url: string;
  health: HealthInfo | null;
  lastError: string | null;
  lastCheck: Date | null;
  refresh: () => void;
}

const POLL_MS = 30_000;

export function useBackendUrl(): string {
  return useSyncExternalStore(
    subscribeBackendUrl,
    getBackendUrl,
    getBackendUrl,
  );
}

export function useBackendStatus(pollMs: number = POLL_MS): BackendStatusResult {
  const url = useBackendUrl();
  const [status, setStatus] = useState<BackendStatus>("checking");
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setStatus("checking");

    const run = async (): Promise<void> => {
      try {
        const h = await fetchHealth(ctrl.signal);
        if (cancelled) return;
        setHealth(h);
        if (h.maintenance?.active || h.status === "maintenance") {
          setStatus("maintenance");
        } else {
          setStatus(h.status === "ok" ? "connected" : "disconnected");
        }
        setLastError(null);
      } catch (err) {
        if (cancelled) return;
        setHealth(null);
        setStatus("disconnected");
        setLastError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLastCheck(new Date());
      }
    };

    void run();
    const id = window.setInterval(run, pollMs);
    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearInterval(id);
    };
  }, [url, pollMs, tick]);

  return {
    status,
    url,
    health,
    lastError,
    lastCheck,
    refresh: () => setTick((n) => n + 1),
  };
}
