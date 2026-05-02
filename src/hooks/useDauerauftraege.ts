// React-Query-Hooks für Daueraufträge.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type {
  Dauerauftrag,
  DauerauftragEinstellungen,
  DauerauftragLauf,
  DauerauftragSonderposition,
} from "@/lib/api/types";

export const qkDA = {
  list: ["dauerauftraege"] as const,
  detail: (id: string) => ["dauerauftraege", id] as const,
  laeufe: (status?: string) => ["dauerauftrag-laeufe", status ?? "all"] as const,
  einstellungen: ["einstellungen", "dauerauftrag"] as const,
};

export type DauerauftragMitDetails = Dauerauftrag & {
  laeufe: DauerauftragLauf[];
  sonderpositionen: DauerauftragSonderposition[];
};

export const useDauerauftraege = () =>
  useQuery({
    queryKey: qkDA.list,
    queryFn: () => api.get<Dauerauftrag[]>("/dauerauftraege"),
  });

export const useDauerauftrag = (id: string) =>
  useQuery({
    queryKey: qkDA.detail(id),
    queryFn: () => api.get<DauerauftragMitDetails>(`/dauerauftraege/${id}`),
    enabled: !!id,
  });

export const useCreateDauerauftrag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Dauerauftrag>) => api.post<Dauerauftrag>("/dauerauftraege", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qkDA.list });
      qc.invalidateQueries({ queryKey: ["aktivitaeten"] });
    },
  });
};

export const useUpdateDauerauftrag = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Dauerauftrag>) =>
      api.patch<Dauerauftrag>(`/dauerauftraege/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qkDA.list });
      qc.invalidateQueries({ queryKey: qkDA.detail(id) });
    },
  });
};

export const useDeleteDauerauftrag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/dauerauftraege/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qkDA.list }),
  });
};

export const useSofortLauf = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<DauerauftragLauf>(`/dauerauftraege/${id}/sofort-lauf`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qkDA.detail(id) });
      qc.invalidateQueries({ queryKey: qkDA.laeufe() });
      qc.invalidateQueries({ queryKey: ["rechnungen"] });
    },
  });
};

/**
 * Bulk-Variante: löst für eine Liste von Dauerauftrags-IDs parallel je einen
 * Sofort-Lauf aus und invalidiert am Ende einmal alle relevanten Queries.
 * Liefert Anzahl Erfolge/Fehler und die erzeugten Rechnungs-IDs.
 */
export const useSofortLaufBulk = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map((id) => api.post<DauerauftragLauf>(`/dauerauftraege/${id}/sofort-lauf`)),
      );
      let erfolge = 0;
      let fehler = 0;
      const rechnungIds: string[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") {
          erfolge++;
          if (r.value.rechnungId) rechnungIds.push(r.value.rechnungId);
        } else {
          fehler++;
        }
      }
      return { erfolge, fehler, rechnungIds };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qkDA.list });
      qc.invalidateQueries({ queryKey: qkDA.laeufe() });
      qc.invalidateQueries({ queryKey: ["rechnungen"] });
      qc.invalidateQueries({ queryKey: ["aktivitaeten"] });
    },
  });
};

export const usePausiereDauerauftrag = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bis: string | null) =>
      api.post<Dauerauftrag>(`/dauerauftraege/${id}/pausieren`, { bis }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qkDA.list });
      qc.invalidateQueries({ queryKey: qkDA.detail(id) });
    },
  });
};

export const useBeendeDauerauftrag = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (zum?: string) => api.post<Dauerauftrag>(`/dauerauftraege/${id}/beenden`, { zum }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qkDA.list });
      qc.invalidateQueries({ queryKey: qkDA.detail(id) });
    },
  });
};

export const useDauerauftragLaeufe = (status?: string) =>
  useQuery({
    queryKey: qkDA.laeufe(status),
    queryFn: () => {
      const q = status ? `?status=${status}` : "";
      return api.get<DauerauftragLauf[]>(`/dauerauftrag-laeufe${q}`);
    },
  });

export const useCreateSonderposition = (dauerauftragId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<DauerauftragSonderposition>) =>
      api.post<DauerauftragSonderposition>("/dauerauftrag-sonderpositionen", {
        ...data,
        dauerauftragId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qkDA.detail(dauerauftragId) }),
  });
};

export const useDeleteSonderposition = (dauerauftragId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/dauerauftrag-sonderpositionen/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qkDA.detail(dauerauftragId) }),
  });
};

export const useDauerauftragEinstellungen = () =>
  useQuery({
    queryKey: qkDA.einstellungen,
    queryFn: () => api.get<DauerauftragEinstellungen>("/einstellungen/dauerauftrag"),
  });

export const useUpdateDauerauftragEinstellungen = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<DauerauftragEinstellungen>) =>
      api.patch<DauerauftragEinstellungen>("/einstellungen/dauerauftrag", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qkDA.einstellungen }),
  });
};
