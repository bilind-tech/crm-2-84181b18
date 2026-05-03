// Steuer-Store: dünner Adapter über React Query gegen das Pi-Backend (/steuern/*).
// Behält die bisherige Hook-Signatur, damit UI-Komponenten unverändert bleiben.
// Beim ersten Mount wandert vorhandener LocalStorage-State einmalig zum Server
// (idempotent, mit Marker `mcc_steuern_migrated_v1`).

import { useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { SteuerEinstellungen, SteuerPosten } from "./types";
import { STEUER_DEFAULTS } from "./types";

const SETTINGS_KEY = "mcc_steuer_einstellungen_v1";
const POSTEN_KEY = "mcc_steuer_posten_v1";
const BEZAHLT_KEY = "mcc_steuer_bezahlt_v1";
const MIGRATED_KEY = "mcc_steuern_migrated_v1";

export interface BezahltMarkierung {
  bezahltAm: string;
  tatsaechlicherBetrag?: number;
  notiz?: string;
}

// ---------- Server-Typen (vom Backend) ----------

interface ServerEinstellungen extends SteuerEinstellungen {
  updatedAt?: string;
  ustBezahltGeloescht?: number;
}

interface ServerManueller {
  id: string;
  art: SteuerPosten["art"];
  titel: string;
  zeitraum: { jahr: number; monat?: number | null; quartal?: number | null };
  faelligAm: string;
  geschaetzterBetrag: number;
  notiz?: string | null;
  erstelltAm: string;
}

interface ServerBezahlt {
  postenId: string;
  bezahltAm: string;
  tatsaechlicherBetrag?: number | null;
  notiz?: string | null;
  erstelltAm: string;
}

// ---------- LocalStorage-Helpers ----------

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function lsRemove(...keys: string[]) {
  if (typeof window === "undefined") return;
  for (const k of keys) {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

function isMigrated(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(MIGRATED_KEY) === "true";
}

function setMigrated() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MIGRATED_KEY, "true");
  } catch {
    /* ignore */
  }
}

// ---------- Query-Keys ----------

export const steuerKeys = {
  einstellungen: ["steuern", "einstellungen"] as const,
  manuell: ["steuern", "manuelle-posten"] as const,
  bezahlt: ["steuern", "bezahlt"] as const,
};

// ---------- Einstellungen ----------

function stripServerExtras(s: ServerEinstellungen): SteuerEinstellungen {
  return {
    kstSatz: s.kstSatz,
    soliSatz: s.soliSatz,
    gewstMesszahl: s.gewstMesszahl,
    gewstHebesatz: s.gewstHebesatz,
    ustRhythmus: s.ustRhythmus,
    ruecklageSatz: s.ruecklageSatz,
    ustPufferSatz: s.ustPufferSatz,
  };
}

export function useSteuerEinstellungen() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: steuerKeys.einstellungen,
    queryFn: () => api.get<ServerEinstellungen>("/steuern/einstellungen"),
    staleTime: 30_000,
    placeholderData: { ...STEUER_DEFAULTS, updatedAt: "" } satisfies ServerEinstellungen,
  });

  const data: SteuerEinstellungen = useMemo(
    () => (q.data ? stripServerExtras(q.data) : STEUER_DEFAULTS),
    [q.data],
  );

  // Einmalige LocalStorage→Server-Migration
  useEffect(() => {
    if (!q.data || isMigrated()) return;
    const local = readJson<Partial<SteuerEinstellungen> | null>(SETTINGS_KEY, null);
    const localPosten = readJson<unknown[]>(POSTEN_KEY, []);
    const localBezahlt = readJson<Record<string, BezahltMarkierung>>(BEZAHLT_KEY, {});

    const hasLocalSettings = local && Object.keys(local).length > 0;
    const hasLocalPosten = Array.isArray(localPosten) && localPosten.length > 0;
    const hasLocalBezahlt = localBezahlt && Object.keys(localBezahlt).length > 0;

    if (!hasLocalSettings && !hasLocalPosten && !hasLocalBezahlt) {
      setMigrated();
      return;
    }

    void (async () => {
      try {
        if (hasLocalSettings) {
          await api.patch("/steuern/einstellungen", local);
          qc.invalidateQueries({ queryKey: steuerKeys.einstellungen });
        }
        if (hasLocalPosten) {
          for (const p of localPosten as Array<Record<string, unknown>>) {
            try {
              await api.post("/steuern/manuelle-posten", {
                art: p.art ?? "manuell",
                titel: p.titel,
                zeitraum: p.zeitraum ?? { jahr: new Date().getFullYear() },
                faelligAm: p.faelligAm,
                geschaetzterBetrag: p.geschaetzterBetrag ?? 0,
                notiz: p.notiz ?? null,
              });
            } catch {
              /* einzelne dürfen scheitern */
            }
          }
          qc.invalidateQueries({ queryKey: steuerKeys.manuell });
        }
        if (hasLocalBezahlt) {
          for (const [postenId, b] of Object.entries(localBezahlt)) {
            try {
              await api.put(`/steuern/bezahlt/${encodeURIComponent(postenId)}`, b);
            } catch {
              /* überspringen */
            }
          }
          qc.invalidateQueries({ queryKey: steuerKeys.bezahlt });
        }
      } finally {
        setMigrated();
        lsRemove(SETTINGS_KEY, POSTEN_KEY, BEZAHLT_KEY);
      }
    })();
  }, [q.data, qc]);

  const updateMut = useMutation({
    mutationFn: (patch: Partial<SteuerEinstellungen>) =>
      api.patch<ServerEinstellungen>("/steuern/einstellungen", patch),
    onSuccess: (res) => {
      qc.setQueryData(steuerKeys.einstellungen, res);
      // Wenn Backend USt-Bezahlt-Markierungen geleert hat → invalidieren
      if (res.ustBezahltGeloescht && res.ustBezahltGeloescht > 0) {
        qc.invalidateQueries({ queryKey: steuerKeys.bezahlt });
      }
    },
  });

  const resetMut = useMutation({
    mutationFn: () => api.post<ServerEinstellungen>("/steuern/einstellungen/reset"),
    onSuccess: (res) => qc.setQueryData(steuerKeys.einstellungen, res),
  });

  return {
    data,
    update: (patch: Partial<SteuerEinstellungen>) => updateMut.mutate(patch),
    reset: () => resetMut.mutate(),
    isLoading: q.isLoading,
  };
}

export function getSteuerEinstellungen(): SteuerEinstellungen {
  // Synchroner Fallback nur noch für Code-Pfade, die keine Hooks nutzen.
  // Im Live-Betrieb laufen alle UI-Konsumenten über useSteuerEinstellungen.
  return STEUER_DEFAULTS;
}

// ---------- Manuelle Posten ----------

export function useManuellePosten() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: steuerKeys.manuell,
    queryFn: () => api.get<ServerManueller[]>("/steuern/manuelle-posten"),
    staleTime: 30_000,
  });

  const posten: SteuerPosten[] = useMemo(() => {
    return (q.data ?? []).map(
      (p): SteuerPosten => ({
        id: p.id,
        art: p.art,
        titel: p.titel,
        zeitraum: {
          jahr: p.zeitraum.jahr,
          monat: p.zeitraum.monat ?? undefined,
          quartal: (p.zeitraum.quartal ?? undefined) as 1 | 2 | 3 | 4 | undefined,
        },
        faelligAm: p.faelligAm,
        geschaetzterBetrag: p.geschaetzterBetrag,
        automatisch: false,
        status: "offen",
        notiz: p.notiz ?? undefined,
        erstelltAm: p.erstelltAm,
      }),
    );
  }, [q.data]);

  const addMut = useMutation({
    mutationFn: (neu: Omit<SteuerPosten, "id" | "erstelltAm" | "automatisch">) =>
      api.post<ServerManueller>("/steuern/manuelle-posten", {
        art: neu.art,
        titel: neu.titel,
        zeitraum: neu.zeitraum,
        faelligAm: neu.faelligAm,
        geschaetzterBetrag: neu.geschaetzterBetrag,
        notiz: neu.notiz ?? null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: steuerKeys.manuell }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<SteuerPosten> }) =>
      api.patch<ServerManueller>(`/steuern/manuelle-posten/${encodeURIComponent(id)}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: steuerKeys.manuell }),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) =>
      api.delete<void>(`/steuern/manuelle-posten/${encodeURIComponent(id)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: steuerKeys.manuell });
      qc.invalidateQueries({ queryKey: steuerKeys.bezahlt });
    },
  });

  return {
    posten,
    add: (neu: Omit<SteuerPosten, "id" | "erstelltAm" | "automatisch">) => addMut.mutate(neu),
    update: (id: string, patch: Partial<SteuerPosten>) => updateMut.mutate({ id, patch }),
    remove: (id: string) => removeMut.mutate(id),
  };
}

// ---------- Bezahlt-Markierungen ----------

export function useBezahltMarkierungen() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: steuerKeys.bezahlt,
    queryFn: () => api.get<Record<string, ServerBezahlt>>("/steuern/bezahlt"),
    staleTime: 30_000,
  });

  const map: Record<string, BezahltMarkierung> = useMemo(() => {
    const out: Record<string, BezahltMarkierung> = {};
    for (const [k, v] of Object.entries(q.data ?? {})) {
      out[k] = {
        bezahltAm: v.bezahltAm,
        tatsaechlicherBetrag: v.tatsaechlicherBetrag ?? undefined,
        notiz: v.notiz ?? undefined,
      };
    }
    return out;
  }, [q.data]);

  const setMut = useMutation({
    mutationFn: ({ postenId, eintrag }: { postenId: string; eintrag: BezahltMarkierung }) =>
      api.put<ServerBezahlt>(`/steuern/bezahlt/${encodeURIComponent(postenId)}`, eintrag),
    // Optimistic Update
    onMutate: async ({ postenId, eintrag }) => {
      await qc.cancelQueries({ queryKey: steuerKeys.bezahlt });
      const prev = qc.getQueryData<Record<string, ServerBezahlt>>(steuerKeys.bezahlt) ?? {};
      qc.setQueryData<Record<string, ServerBezahlt>>(steuerKeys.bezahlt, {
        ...prev,
        [postenId]: {
          postenId,
          bezahltAm: eintrag.bezahltAm,
          tatsaechlicherBetrag: eintrag.tatsaechlicherBetrag ?? null,
          notiz: eintrag.notiz ?? null,
          erstelltAm: new Date().toISOString(),
        },
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(steuerKeys.bezahlt, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: steuerKeys.bezahlt }),
  });

  const removeMut = useMutation({
    mutationFn: (postenId: string) =>
      api.delete<void>(`/steuern/bezahlt/${encodeURIComponent(postenId)}`),
    onMutate: async (postenId) => {
      await qc.cancelQueries({ queryKey: steuerKeys.bezahlt });
      const prev = qc.getQueryData<Record<string, ServerBezahlt>>(steuerKeys.bezahlt) ?? {};
      const next = { ...prev };
      delete next[postenId];
      qc.setQueryData(steuerKeys.bezahlt, next);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(steuerKeys.bezahlt, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: steuerKeys.bezahlt }),
  });

  return {
    map,
    setBezahlt: (postenId: string, eintrag: BezahltMarkierung) =>
      setMut.mutate({ postenId, eintrag }),
    removeBezahlt: (postenId: string) => removeMut.mutate(postenId),
  };
}
