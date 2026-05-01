// React-Query-Hooks für Zahlungseingänge.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type {
  Zahlungseingang,
  ZahlungsabgleichEinstellungen,
} from "@/lib/api/types";

export const qkZE = {
  list: (status?: string) => ["zahlungseingaenge", status ?? "all"] as const,
  einstellungen: ["einstellungen", "zahlungsabgleich"] as const,
};

export const useZahlungseingaenge = (status?: string) =>
  useQuery({
    queryKey: qkZE.list(status),
    queryFn: () => {
      const q = status ? `?status=${status}` : "";
      return api.get<Zahlungseingang[]>(`/zahlungseingaenge${q}`);
    },
  });

export const useCreateZahlungseingang = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Zahlungseingang>) =>
      api.post<Zahlungseingang>("/zahlungseingaenge", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["zahlungseingaenge"] }),
  });
};

export const useImportZahlungseingaenge = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eintraege: Partial<Zahlungseingang>[]) =>
      api.post<{ anzahl: number; eintraege: Zahlungseingang[] }>(
        "/zahlungseingaenge/import",
        { eintraege },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["zahlungseingaenge"] });
      qc.invalidateQueries({ queryKey: ["aktivitaeten"] });
    },
  });
};

export const useDeleteZahlungseingang = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/zahlungseingaenge/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["zahlungseingaenge"] });
      qc.invalidateQueries({ queryKey: ["rechnungen"] });
    },
  });
};

export const useIgnoriereZahlungseingang = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Zahlungseingang>(`/zahlungseingaenge/${id}/ignorieren`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["zahlungseingaenge"] }),
  });
};

export interface ZuordnungInput {
  rechnungId: string;
  betrag: number;
  score?: number;
}

export const useZuordnenZahlungseingang = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, zuordnungen }: { id: string; zuordnungen: ZuordnungInput[] }) =>
      api.post<Zahlungseingang>(`/zahlungseingaenge/${id}/zuordnen`, { zuordnungen }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["zahlungseingaenge"] });
      qc.invalidateQueries({ queryKey: ["rechnungen"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["aktivitaeten"] });
    },
  });
};

export const useLoeseZuordnung = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<Zahlungseingang>(`/zahlungseingaenge/${id}/zuordnung-loesen`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["zahlungseingaenge"] });
      qc.invalidateQueries({ queryKey: ["rechnungen"] });
    },
  });
};

export const useZahlungsabgleichEinstellungen = () =>
  useQuery({
    queryKey: qkZE.einstellungen,
    queryFn: () => api.get<ZahlungsabgleichEinstellungen>("/einstellungen/zahlungsabgleich"),
  });

export const useUpdateZahlungsabgleichEinstellungen = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ZahlungsabgleichEinstellungen>) =>
      api.patch<ZahlungsabgleichEinstellungen>("/einstellungen/zahlungsabgleich", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qkZE.einstellungen }),
  });
};
