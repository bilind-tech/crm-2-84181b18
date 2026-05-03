// Stundenzettel-URL-Konfiguration.
// Backend ist die einzige Quelle der Wahrheit (`/einstellungen/stundenzettel`),
// damit alle Geräte im LAN denselben Stand sehen. Alte Werte aus localStorage
// werden einmalig migriert (Marker `mcc_stundenzettel_migrated_v1`).

import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

const STORAGE_KEY = "mcc.stundenzettel.url";
const MIGRATION_MARKER = "mcc_stundenzettel_migrated_v1";
const QUERY_KEY = ["einstellungen", "stundenzettel"] as const;

interface StundenzettelSettings {
  externeUrl: string;
}

async function fetchStundenzettel(): Promise<StundenzettelSettings> {
  return await api.get<StundenzettelSettings>("/einstellungen/stundenzettel");
}

async function patchStundenzettel(url: string): Promise<StundenzettelSettings> {
  return await api.patch<StundenzettelSettings>("/einstellungen/stundenzettel", {
    externeUrl: url.trim(),
  });
}

/**
 * Liefert die Stundenzettel-URL aus dem Backend.
 * Triggert beim ersten Mount die einmalige localStorage-Migration.
 */
export function useStundenzettelUrl(): {
  url: string;
  isLoading: boolean;
  isError: boolean;
} {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchStundenzettel,
    staleTime: 60_000,
  });

  // Einmalige Migration: localStorage → Backend, wenn Backend leer.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (q.isLoading || q.isError) return;
    if (localStorage.getItem(MIGRATION_MARKER)) return;

    const local = localStorage.getItem(STORAGE_KEY)?.trim() ?? "";
    const backend = q.data?.externeUrl?.trim() ?? "";

    if (local && !backend) {
      void patchStundenzettel(local)
        .then(() => {
          localStorage.setItem(MIGRATION_MARKER, "1");
          localStorage.removeItem(STORAGE_KEY);
          qc.invalidateQueries({ queryKey: QUERY_KEY });
        })
        .catch(() => {
          /* Migration darf scheitern — wird beim nächsten Mount erneut versucht */
        });
    } else {
      // Nichts zu migrieren — Marker setzen, damit wir nicht jedes Mal prüfen.
      localStorage.setItem(MIGRATION_MARKER, "1");
      if (local && backend) localStorage.removeItem(STORAGE_KEY);
    }
  }, [q.data, q.isLoading, q.isError, qc]);

  return useMemo(
    () => ({
      url: q.data?.externeUrl?.trim() ?? "",
      isLoading: q.isLoading,
      isError: q.isError,
    }),
    [q.data, q.isLoading, q.isError],
  );
}

export function useSetStundenzettelUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: patchStundenzettel,
    onSuccess: (data) => {
      qc.setQueryData(QUERY_KEY, data);
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
