// Zentrale React-Query-Hooks. Jede Entität hat ein QueryKey-Objekt + Hooks.

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { piApi, PiApiError } from "@/lib/api/piClient";
import type {
  Aktivitaet,
  Angebot,
  Ansprechpartner,
  AppearanceEinstellungen,
  BackupEintrag,
  BackupEinstellungen,
  Benachrichtigung,
  DashboardKennzahlen,
  Dokument,
  UploadSession,
  EmailSignatur,
  EmailVersand,
  EmailVorlage,
  Firmendaten,
  GoogleDriveEinstellungen,
  InstallierteVersion,
  Kunde,
  Notiz,
  Nummernkreise,
  Objekt,
  Positionsvorlage,
  Rechnung,
  SicherheitsEinstellungen,
  SitzungEintrag,
  SmtpEinstellungen,
  SuchTreffer,
  SystemInfo,
  Textvorlage,
  UmsatzPunkt,
  UpdateLauf,
  UpdatePackageInfo,
  Warnung,
  Zahlung,
} from "@/lib/api/types";

export const qk = {
  kunden: ["kunden"] as const,
  kunde: (id: string) => ["kunden", id] as const,
  ansprechpartner: (kundeId?: string) => ["ansprechpartner", kundeId ?? "all"] as const,
  objekte: (kundeId?: string) => ["objekte", kundeId ?? "all"] as const,
  objekt: (id: string) => ["objekte", id] as const,
  angebote: (kundeId?: string) => ["angebote", kundeId ?? "all"] as const,
  angebot: (id: string) => ["angebote", id] as const,
  rechnungen: (kundeId?: string) => ["rechnungen", kundeId ?? "all"] as const,
  rechnung: (id: string) => ["rechnungen", id] as const,
  dokumente: (kundeId?: string) => ["dokumente", kundeId ?? "all"] as const,
  aktivitaeten: ["aktivitaeten"] as const,
  benachrichtigungen: ["benachrichtigungen"] as const,
  dashboard: {
    kennzahlen: ["dashboard", "kennzahlen"] as const,
    umsatz: ["dashboard", "umsatz"] as const,
    warnungen: ["dashboard", "warnungen"] as const,
  },
  einstellungen: {
    firma: ["einstellungen", "firma"] as const,
    smtp: ["einstellungen", "smtp"] as const,
    nummernkreise: ["einstellungen", "nummernkreise"] as const,
    sicherheit: ["einstellungen", "sicherheit"] as const,
    erscheinung: ["einstellungen", "erscheinung"] as const,
    backup: ["einstellungen", "backup"] as const,
    backupHistorie: ["einstellungen", "backup", "historie"] as const,
    googleDrive: ["einstellungen", "googleDrive"] as const,
    sitzungen: ["einstellungen", "sitzungen"] as const,
    
    positionsvorlagen: ["einstellungen", "positionsvorlagen"] as const,
    textvorlagen: ["einstellungen", "textvorlagen"] as const,
    systemInfo: ["system", "info"] as const,
    updateHistorie: ["system", "update", "historie"] as const,
    updateLauf: (id: string) => ["system", "update", "lauf", id] as const,
  },
  email: {
    vorlagen: ["email", "vorlagen"] as const,
    signaturen: ["email", "signaturen"] as const,
    versand: (filter?: { belegId?: string; belegTyp?: string }) =>
      ["email", "versand", filter ?? {}] as const,
  },
  search: (q: string) => ["search", q] as const,
};

// ---------- Kunden ----------
export const useKunden = (params?: { q?: string; status?: string; tag?: string; archiviert?: boolean }) =>
  useQuery({
    queryKey: [...qk.kunden, params],
    queryFn: () => {
      const q = new URLSearchParams();
      if (params?.q) q.set("q", params.q);
      if (params?.status) q.set("status", params.status);
      if (params?.tag) q.set("tag", params.tag);
      if (params?.archiviert) q.set("archiviert", "true");
      const s = q.toString();
      return api.get<Kunde[]>(`/kunden${s ? `?${s}` : ""}`);
    },
  });

export const useKunde = (id: string) =>
  useQuery({
    queryKey: qk.kunde(id),
    queryFn: () => api.get<Kunde & {
      ansprechpartner: Ansprechpartner[];
      objekte: Objekt[];
      angebote: Angebot[];
      rechnungen: Rechnung[];
      dokumente: Dokument[];
      notizen: Notiz[];
    }>(`/kunden/${id}`),
    enabled: !!id,
  });

export const useCreateKunde = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Kunde> & { startZaehlerAktuellerMonat?: number }) =>
      api.post<Kunde>("/kunden", data),
    onSuccess: (neu) => {
      // Detail-Daten für die frisch angelegte Kunden-ID vorab in den Cache
      // schreiben, damit /kunden/:id ohne Lade-Lücke direkt rendert.
      qc.setQueryData(qk.kunde(neu.id), {
        ...neu,
        ansprechpartner: [],
        objekte: [],
        angebote: [],
        rechnungen: [],
        dokumente: [],
        notizen: [],
      });
      qc.invalidateQueries({ queryKey: qk.kunden });
      qc.invalidateQueries({ queryKey: qk.dashboard.kennzahlen });
    },
  });
};

export const useUpdateKunde = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Kunde> & { startZaehlerAktuellerMonat?: number }) =>
      api.patch<Kunde>(`/kunden/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.kunden });
      qc.invalidateQueries({ queryKey: qk.kunde(id) });
      qc.invalidateQueries({ queryKey: ["kunden", id, "zaehler"] });
    },
  });
};

export const useKundenZaehler = (id: string) =>
  useQuery({
    queryKey: ["kunden", id, "zaehler"],
    queryFn: () => api.get<{ periode: string; naechsterStart: number }>(`/kunden/${id}/zaehler`),
    enabled: !!id,
  });

/**
 * Live-Verfügbarkeitsprüfung für Kunden-Kürzel.
 * Aktiviert sobald `kuerzel` mindestens 3 Zeichen hat. Mit `exceptId`
 * wird der eigene Datensatz beim Bearbeiten ignoriert.
 */
export const useKuerzelFrei = (kuerzel: string, exceptId?: string) => {
  const norm = (kuerzel ?? "").trim().toUpperCase();
  return useQuery({
    queryKey: ["kunden", "kuerzel-frei", norm, exceptId ?? "neu"],
    queryFn: () => {
      const params = new URLSearchParams({ kuerzel: norm });
      if (exceptId) params.set("exceptId", exceptId);
      return api.get<{ frei: boolean; kunde?: { id: string; nummer: string; name: string } }>(
        `/kunden/kuerzel-frei?${params.toString()}`,
      );
    },
    enabled: norm.length >= 3,
    staleTime: 10_000,
  });
};

export const useDeleteKunde = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/kunden/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.kunden });
      qc.invalidateQueries({ queryKey: qk.dashboard.kennzahlen });
    },
  });
};

// ---------- Ansprechpartner ----------
export const useCreateAnsprechpartner = (kundeId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Ansprechpartner>) =>
      api.post<Ansprechpartner>("/ansprechpartner", { ...data, kundeId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.kunde(kundeId) }),
  });
};
export const useUpdateAnsprechpartner = (kundeId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Ansprechpartner> & { id: string }) =>
      api.patch<Ansprechpartner>(`/ansprechpartner/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.kunde(kundeId) }),
  });
};
export const useDeleteAnsprechpartner = (kundeId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/ansprechpartner/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.kunde(kundeId) }),
  });
};

// ---------- Objekte ----------
export const useObjekte = (kundeId?: string) =>
  useQuery({
    queryKey: qk.objekte(kundeId),
    queryFn: () => api.get<Objekt[]>(kundeId ? `/objekte?kundeId=${kundeId}` : "/objekte"),
  });

export const useObjekt = (id: string) =>
  useQuery({ queryKey: qk.objekt(id), queryFn: () => api.get<Objekt>(`/objekte/${id}`), enabled: !!id });

export const useCreateObjekt = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Objekt>) => api.post<Objekt>("/objekte", data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["objekte"] });
      if (vars.kundeId) qc.invalidateQueries({ queryKey: qk.kunde(vars.kundeId) });
      qc.invalidateQueries({ queryKey: qk.dashboard.kennzahlen });
    },
  });
};
export const useUpdateObjekt = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Objekt>) => api.patch<Objekt>(`/objekte/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["objekte"] });
      qc.invalidateQueries({ queryKey: qk.objekt(id) });
    },
  });
};
export const useDeleteObjekt = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/objekte/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["objekte"] }),
  });
};

// ---------- Angebote ----------
export const useAngebote = (params?: { kundeId?: string; status?: string }) =>
  useQuery({
    queryKey: [...qk.angebote(params?.kundeId), params?.status ?? "all"],
    queryFn: () => {
      const q = new URLSearchParams();
      if (params?.kundeId) q.set("kundeId", params.kundeId);
      if (params?.status) q.set("status", params.status);
      const s = q.toString();
      return api.get<Angebot[]>(`/angebote${s ? `?${s}` : ""}`);
    },
  });

export const useAngebot = (id: string) =>
  useQuery({ queryKey: qk.angebot(id), queryFn: () => api.get<Angebot>(`/angebote/${id}`), enabled: !!id });

export const useCreateAngebot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Angebot>) => api.post<Angebot>("/angebote", data),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["angebote"] });
      qc.invalidateQueries({ queryKey: qk.dashboard.kennzahlen });
      if (created?.kundeId) {
        qc.invalidateQueries({ queryKey: ["kunden", created.kundeId, "zaehler"] });
      }
    },
  });
};
export const useUpdateAngebot = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Angebot>) => api.patch<Angebot>(`/angebote/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["angebote"] });
      qc.invalidateQueries({ queryKey: qk.angebot(id) });
    },
  });
};
export const useDeleteAngebot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/angebote/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["angebote"] }),
  });
};
export const useSendeAngebot = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>(`/angebote/${id}/senden`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.angebot(id) });
      qc.invalidateQueries({ queryKey: ["angebote"] });
      qc.invalidateQueries({ queryKey: qk.benachrichtigungen });
      qc.invalidateQueries({ queryKey: qk.aktivitaeten });
    },
  });
};
export const useAngebotInRechnung = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Rechnung>(`/angebote/${id}/in-rechnung-umwandeln`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["angebote"] });
      qc.invalidateQueries({ queryKey: ["rechnungen"] });
      qc.invalidateQueries({ queryKey: qk.dashboard.kennzahlen });
    },
  });
};
export const useDuplicateAngebot = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Angebot>(`/angebote/${id}/duplizieren`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["angebote"] }),
  });
};

// ---------- Rechnungen ----------
export const useRechnungen = (params?: { kundeId?: string; status?: string }) =>
  useQuery({
    queryKey: [...qk.rechnungen(params?.kundeId), params?.status ?? "all"],
    queryFn: () => {
      const q = new URLSearchParams();
      if (params?.kundeId) q.set("kundeId", params.kundeId);
      if (params?.status) q.set("status", params.status);
      const s = q.toString();
      return api.get<Rechnung[]>(`/rechnungen${s ? `?${s}` : ""}`);
    },
  });

export const useRechnung = (id: string) =>
  useQuery({ queryKey: qk.rechnung(id), queryFn: () => api.get<Rechnung>(`/rechnungen/${id}`), enabled: !!id });

/**
 * Invalidiert alle Caches, die sich verändern, wenn eine Rechnung oder
 * Zahlung angelegt/geändert/gelöscht wird. So aktualisieren KPI-Kacheln,
 * Dashboard, Umsatz-Chart, Warnungen und Aktivitäten live.
 */
function invalidateRechnungScope(qc: QueryClient, rechnungId?: string) {
  qc.invalidateQueries({ queryKey: ["rechnungen"] });
  if (rechnungId) qc.invalidateQueries({ queryKey: qk.rechnung(rechnungId) });
  qc.invalidateQueries({ queryKey: qk.dashboard.kennzahlen });
  qc.invalidateQueries({ queryKey: qk.dashboard.umsatz });
  qc.invalidateQueries({ queryKey: qk.dashboard.warnungen });
  qc.invalidateQueries({ queryKey: qk.aktivitaeten });
  qc.invalidateQueries({ queryKey: qk.benachrichtigungen });
}

export const useCreateRechnung = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Rechnung>) => api.post<Rechnung>("/rechnungen", data),
    onSuccess: (created) => {
      invalidateRechnungScope(qc);
      qc.invalidateQueries({ queryKey: ["dauerauftraege"] });
      qc.invalidateQueries({ queryKey: ["dauerauftrag-laeufe"] });
      if (created?.kundeId) {
        qc.invalidateQueries({ queryKey: ["kunden", created.kundeId, "zaehler"] });
      }
    },
  });
};
export const useUpdateRechnung = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Rechnung>) => api.patch<Rechnung>(`/rechnungen/${id}`, data),
    onSuccess: () => {
      invalidateRechnungScope(qc, id);
      qc.invalidateQueries({ queryKey: ["dauerauftraege"] });
      qc.invalidateQueries({ queryKey: ["dauerauftrag-laeufe"] });
    },
  });
};
export const useDeleteRechnung = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/rechnungen/${id}`),
    onSuccess: () => invalidateRechnungScope(qc),
  });
};
export const useSendeRechnung = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>(`/rechnungen/${id}/senden`),
    onSuccess: () => invalidateRechnungScope(qc, id),
  });
};
export const useAddZahlung = (rechnungId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Zahlung>) => api.post<Zahlung>(`/rechnungen/${rechnungId}/zahlungen`, data),
    onSuccess: () => invalidateRechnungScope(qc, rechnungId),
  });
};
export const useDeleteZahlung = (rechnungId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (zahlungId: string) =>
      api.delete<void>(`/rechnungen/${rechnungId}/zahlungen/${zahlungId}`),
    onSuccess: () => invalidateRechnungScope(qc, rechnungId),
  });
};

// ---------- Dokumente ----------
export const useDokumente = (params?: { kundeId?: string; objektId?: string }) =>
  useQuery({
    queryKey: [...qk.dokumente(params?.kundeId), params?.objektId ?? "all"],
    queryFn: () => {
      const q = new URLSearchParams();
      if (params?.kundeId) q.set("kundeId", params.kundeId);
      if (params?.objektId) q.set("objektId", params.objektId);
      const s = q.toString();
      return api.get<Dokument[]>(`/dokumente${s ? `?${s}` : ""}`);
    },
  });
export const useCreateDokument = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Dokument>) => api.post<Dokument>("/dokumente", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dokumente"] }),
  });
};
export const useUpdateDokument = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<Dokument> & { id: string }) =>
      api.patch<Dokument>(`/dokumente/${id}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dokumente"] });
      qc.invalidateQueries({ queryKey: ["benachrichtigungen"] });
    },
  });
};
export const useDeleteDokument = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/dokumente/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dokumente"] }),
  });
};

// ---------- Upload-Sessions (Handy-Scan-Brücke) ----------
export type UploadSessionMitDateien = UploadSession & { dateien: Dokument[] };

export const useCreateUploadSession = () =>
  useMutation({
    mutationFn: () => api.post<UploadSession>("/upload-sessions", {}),
  });

/** Pollt eine Upload-Session alle 1.5s, solange der Hook aktiv ist. */
export const useUploadSessionLive = (token: string | undefined) =>
  useQuery({
    queryKey: ["upload-session", token ?? "none"],
    enabled: !!token,
    queryFn: () => api.get<UploadSessionMitDateien>(`/upload-sessions/${token}`),
    refetchInterval: 1500,
    staleTime: 0,
  });

export const useUploadDateienToSession = (token: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dateien: Partial<Dokument>[]) =>
      api.post<{ dateien: Dokument[] }>(`/upload-sessions/${token}/dateien`, { dateien }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["upload-session", token] });
      qc.invalidateQueries({ queryKey: ["dokumente"] });
    },
  });
};

export const useBeendeUploadSession = () =>
  useMutation({
    mutationFn: (token: string) =>
      api.post<void>(`/upload-sessions/${token}/beenden`, {}),
  });

// ---------- Notizen ----------
export const useCreateNotiz = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Notiz>) => api.post<Notiz>("/notizen", data),
    onSuccess: (_, vars) => {
      if (vars.kundeId) qc.invalidateQueries({ queryKey: qk.kunde(vars.kundeId) });
    },
  });
};
export const useDeleteNotiz = (kundeId?: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/notizen/${id}`),
    onSuccess: () => {
      if (kundeId) qc.invalidateQueries({ queryKey: qk.kunde(kundeId) });
    },
  });
};

// ---------- Dashboard ----------
function zeitraumQuery(z?: { jahr: string; monat: string }): string {
  if (!z || z.jahr === "alle") return "";
  const params = new URLSearchParams({ jahr: z.jahr });
  if (z.monat !== "alle") params.set("monat", z.monat);
  return `?${params.toString()}`;
}
export const useDashboardKennzahlen = (zeitraum?: { jahr: string; monat: string }) =>
  useQuery({
    queryKey: [...qk.dashboard.kennzahlen, zeitraum ?? null] as const,
    queryFn: () => api.get<DashboardKennzahlen>(`/dashboard/kennzahlen${zeitraumQuery(zeitraum)}`),
  });
export const useUmsatz = (zeitraum?: { jahr: string; monat: string }) =>
  useQuery({
    queryKey: [...qk.dashboard.umsatz, zeitraum ?? null] as const,
    queryFn: () => api.get<UmsatzPunkt[]>(`/dashboard/umsatz${zeitraumQuery(zeitraum)}`),
  });
export const useWarnungen = () =>
  useQuery({ queryKey: qk.dashboard.warnungen, queryFn: () => api.get<Warnung[]>("/dashboard/warnungen") });

// ---------- Suche ----------
export const useSearch = (q: string) =>
  useQuery({
    queryKey: qk.search(q),
    queryFn: () => api.get<SuchTreffer[]>(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.length > 0,
  });

// ---------- Aktivitäten / Benachrichtigungen ----------
import {
  adaptAktivitaet,
  adaptBenachrichtigung,
  unwrapList,
  type BackendAktivitaet,
  type BackendBenachrichtigung,
} from "@/lib/api/adapters";

export const useAktivitaeten = () =>
  useQuery({
    queryKey: qk.aktivitaeten,
    queryFn: async (): Promise<Aktivitaet[]> => {
      const raw = await api.get<unknown>("/aktivitaeten");
      const items = unwrapList<BackendAktivitaet | Aktivitaet>(raw);
      return items.map((it) =>
        "art" in it ? adaptAktivitaet(it as BackendAktivitaet) : (it as Aktivitaet),
      );
    },
  });

export const useBenachrichtigungen = () =>
  useQuery({
    queryKey: qk.benachrichtigungen,
    queryFn: async (): Promise<Benachrichtigung[]> => {
      const raw = await api.get<unknown>("/benachrichtigungen");
      const items = unwrapList<BackendBenachrichtigung | Benachrichtigung>(raw);
      return items.map((it) =>
        "prioritaet" in it ? adaptBenachrichtigung(it as BackendBenachrichtigung) : (it as Benachrichtigung),
      );
    },
    refetchInterval: 60_000,
  });

export const useMarkBenachrichtigungGelesen = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch<void>(`/benachrichtigungen/${id}/gelesen`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.benachrichtigungen }),
  });
};
export const useMarkAlleBenachrichtigungenGelesen = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>("/benachrichtigungen/alle-gelesen"),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.benachrichtigungen }),
  });
};

// ---------- Einstellungen ----------
export const useFirmendaten = () =>
  useQuery({ queryKey: qk.einstellungen.firma, queryFn: () => api.get<Firmendaten>("/einstellungen/firma") });
export const useUpdateFirmendaten = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Firmendaten>) => api.patch<Firmendaten>("/einstellungen/firma", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.einstellungen.firma }),
  });
};

export const useSmtp = () =>
  useQuery({ queryKey: qk.einstellungen.smtp, queryFn: () => api.get<SmtpEinstellungen>("/einstellungen/smtp") });
export const useUpdateSmtp = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SmtpEinstellungen> & { passwort?: string }) =>
      api.patch<SmtpEinstellungen>("/einstellungen/smtp", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.einstellungen.smtp }),
  });
};
export const useTestSmtp = () =>
  useMutation({ mutationFn: () => api.post<{ erfolg: boolean; nachricht: string }>("/einstellungen/smtp/test") });

export const useNummernkreise = () =>
  useQuery({ queryKey: qk.einstellungen.nummernkreise, queryFn: () => api.get<Nummernkreise>("/einstellungen/nummernkreise") });
export const useUpdateNummernkreise = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Nummernkreise>) => api.patch<Nummernkreise>("/einstellungen/nummernkreise", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.einstellungen.nummernkreise }),
  });
};

export const useSicherheit = () =>
  useQuery({ queryKey: qk.einstellungen.sicherheit, queryFn: () => api.get<SicherheitsEinstellungen>("/einstellungen/sicherheit") });
export const useUpdateSicherheit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SicherheitsEinstellungen>) =>
      api.patch<SicherheitsEinstellungen>("/einstellungen/sicherheit", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.einstellungen.sicherheit }),
  });
};

export const useErscheinung = () =>
  useQuery({ queryKey: qk.einstellungen.erscheinung, queryFn: () => api.get<AppearanceEinstellungen>("/einstellungen/erscheinung") });
export const useUpdateErscheinung = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<AppearanceEinstellungen>) =>
      api.patch<AppearanceEinstellungen>("/einstellungen/erscheinung", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.einstellungen.erscheinung }),
  });
};

export const useBackup = () =>
  useQuery({ queryKey: qk.einstellungen.backup, queryFn: () => api.get<BackupEinstellungen>("/einstellungen/backup") });
export const useUpdateBackup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<BackupEinstellungen>) =>
      api.patch<BackupEinstellungen>("/einstellungen/backup", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.einstellungen.backup }),
  });
};
export const useCreateBackup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean }>("/backup/erstellen"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.einstellungen.backupHistorie });
      qc.invalidateQueries({ queryKey: ["backup", "in-arbeit"] });
    },
  });
};

export const useRestoreBackup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ backupId, passwort }: { backupId: string; passwort: string }) =>
      api.post<{ ok: boolean }>(`/backup/${backupId}/restore`, { passwort }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.einstellungen.backupHistorie });
      qc.invalidateQueries({ queryKey: ["backup", "restore-status"] });
    },
  });
};

// FormData-Upload geht direkt über piApi (multipart),
// damit das Backend die Datei streamen kann.

export const useUploadBackup = () =>
  useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file, file.name);
      try {
        const res = await piApi.post<{
          uploadId: string;
          fileName: string;
          sizeBytes: number;
          version?: string;
          schemaVersion?: number;
          vermutetesDatum?: string;
        }>("/backup/upload", fd);
        return { ...res, valide: true };
      } catch (e) {
        if (e instanceof PiApiError && (e.status === 415 || e.status === 400)) {
          return { uploadId: "", fileName: file.name, sizeBytes: file.size, valide: false };
        }
        throw e;
      }
    },
  });

export const useRestoreUploadedBackup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ uploadId, passwort }: { uploadId: string; passwort: string }) =>
      api.post<{ ok: boolean }>(`/backup/upload/${uploadId}/restore`, { passwort }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.einstellungen.backupHistorie });
      qc.invalidateQueries({ queryKey: ["backup", "restore-status"] });
    },
  });
};

export const useDeleteBackup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean }>(`/backup/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.einstellungen.backupHistorie }),
  });
};

export const usePositionsvorlagen = () =>
  useQuery({ queryKey: qk.einstellungen.positionsvorlagen, queryFn: () => api.get<Positionsvorlage[]>("/einstellungen/positionsvorlagen") });
export const useCreatePositionsvorlage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Positionsvorlage>) => api.post<Positionsvorlage>("/einstellungen/positionsvorlagen", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.einstellungen.positionsvorlagen }),
  });
};
export const useUpdatePositionsvorlage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Positionsvorlage> & { id: string }) =>
      api.patch<Positionsvorlage>(`/einstellungen/positionsvorlagen/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.einstellungen.positionsvorlagen }),
  });
};
export const useDeletePositionsvorlage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/einstellungen/positionsvorlagen/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.einstellungen.positionsvorlagen }),
  });
};

export const useTextvorlagen = () =>
  useQuery({ queryKey: qk.einstellungen.textvorlagen, queryFn: () => api.get<Textvorlage[]>("/einstellungen/textvorlagen") });
export const useCreateTextvorlage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Textvorlage>) => api.post<Textvorlage>("/einstellungen/textvorlagen", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.einstellungen.textvorlagen }),
  });
};
export const useUpdateTextvorlage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Textvorlage> & { id: string }) =>
      api.patch<Textvorlage>(`/einstellungen/textvorlagen/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.einstellungen.textvorlagen }),
  });
};
export const useDeleteTextvorlage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/einstellungen/textvorlagen/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.einstellungen.textvorlagen }),
  });
};

export const usePasswortAendern = () =>
  useMutation({
    mutationFn: (data: { altesPasswort: string; neuesPasswort: string }) =>
      api.post<void>("/auth/passwort-aendern", data),
  });

// ---------- E-Mail-Vorlagen ----------
export const useEmailVorlagen = () =>
  useQuery({
    queryKey: qk.email.vorlagen,
    queryFn: () => api.get<EmailVorlage[]>("/email/vorlagen"),
  });
export const useCreateEmailVorlage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<EmailVorlage>) => api.post<EmailVorlage>("/email/vorlagen", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.email.vorlagen }),
  });
};
export const useUpdateEmailVorlage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<EmailVorlage> & { id: string }) =>
      api.patch<EmailVorlage>(`/email/vorlagen/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.email.vorlagen }),
  });
};
export const useDeleteEmailVorlage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/email/vorlagen/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.email.vorlagen }),
  });
};

// ---------- E-Mail-Signaturen ----------
export const useEmailSignaturen = () =>
  useQuery({
    queryKey: qk.email.signaturen,
    queryFn: () => api.get<EmailSignatur[]>("/email/signaturen"),
  });
export const useCreateEmailSignatur = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<EmailSignatur>) => api.post<EmailSignatur>("/email/signaturen", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.email.signaturen }),
  });
};
export const useUpdateEmailSignatur = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<EmailSignatur> & { id: string }) =>
      api.patch<EmailSignatur>(`/email/signaturen/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.email.signaturen }),
  });
};
export const useDeleteEmailSignatur = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/email/signaturen/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.email.signaturen }),
  });
};

// ---------- E-Mail-Versand-Historie ----------
export const useEmailVersand = (filter?: { belegId?: string; belegTyp?: string }) =>
  useQuery({
    queryKey: qk.email.versand(filter),
    queryFn: () => {
      const q = new URLSearchParams();
      if (filter?.belegId) q.set("belegId", filter.belegId);
      if (filter?.belegTyp) q.set("belegTyp", filter.belegTyp);
      const s = q.toString();
      return api.get<EmailVersand[]>(`/email/versand${s ? `?${s}` : ""}`);
    },
  });
export const useSendEmail = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<EmailVersand> & { mahnStufe?: 1 | 2 | 3 }) =>
      api.post<EmailVersand>("/email/versand", data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["email", "versand"] });
      qc.invalidateQueries({ queryKey: qk.aktivitaeten });
      if (vars.belegTyp === "angebot" && vars.belegId) {
        qc.invalidateQueries({ queryKey: qk.angebot(vars.belegId) });
        qc.invalidateQueries({ queryKey: ["angebote"] });
      }
      if (vars.belegTyp === "rechnung" && vars.belegId) {
        qc.invalidateQueries({ queryKey: qk.rechnung(vars.belegId) });
        qc.invalidateQueries({ queryKey: ["rechnungen"] });
      }
    },
  });
};

// ---------- Mahnwesen ----------
export const useMahnEinstellungen = () =>
  useQuery({
    queryKey: ["einstellungen", "mahnung"] as const,
    queryFn: () => api.get<import("@/lib/api/types").MahnEinstellungen>("/einstellungen/mahnung"),
  });

export const useUpdateMahnEinstellungen = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<import("@/lib/api/types").MahnEinstellungen>) =>
      api.patch<import("@/lib/api/types").MahnEinstellungen>("/einstellungen/mahnung", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["einstellungen", "mahnung"] }),
  });
};

export const useMahnStatus = () =>
  useQuery({
    queryKey: ["mahnung", "status"] as const,
    queryFn: () => api.get<import("@/lib/api/types").MahnStatus>("/mahnung/status"),
    staleTime: 15_000,
  });

export const useMahnLaeufe = () =>
  useQuery({
    queryKey: ["mahnung", "laeufe"] as const,
    queryFn: () => api.get<import("@/lib/api/types").MahnLauf[]>("/mahnung/laeufe"),
    staleTime: 15_000,
  });

export const useMahnLauf = (id: string | null | undefined) =>
  useQuery({
    queryKey: ["mahnung", "laeufe", id] as const,
    queryFn: () =>
      api.get<import("@/lib/api/types").MahnLaufDetail>(`/mahnung/laeufe/${id}`),
    enabled: !!id,
  });

export const useMahnungVersenden = (rechnungId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stufe: import("@/lib/api/types").MahnStufe) =>
      api.post<{ ok: true; emailVersandId?: string }>(
        `/rechnungen/${rechnungId}/mahnung-versenden`,
        { stufe },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.rechnung(rechnungId) });
      qc.invalidateQueries({ queryKey: ["rechnungen"] });
      qc.invalidateQueries({ queryKey: ["mahnung"] });
      qc.invalidateQueries({ queryKey: ["email"] });
      qc.invalidateQueries({ queryKey: qk.aktivitaeten });
      qc.invalidateQueries({ queryKey: qk.benachrichtigungen });
    },
  });
};

export const useMahnJetztPruefen = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (modus?: import("@/lib/api/types").MahnModus) =>
      api.post<{
        laufId: string;
        modus: import("@/lib/api/types").MahnModus;
        geprueft: number;
        vorschlaege: number;
        versendet: number;
        uebersprungen: number;
        fehler: number;
      }>("/mahnung/jetzt-pruefen", modus ? { modus } : {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mahnung"] });
      qc.invalidateQueries({ queryKey: ["rechnungen"] });
    },
  });
};

export const useMahnungPausieren = (rechnungId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bis: string | null) =>
      api.post<Rechnung>(`/rechnungen/${rechnungId}/mahnung-pausieren`, { bis }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.rechnung(rechnungId) });
      qc.invalidateQueries({ queryKey: ["rechnungen"] });
    },
  });
};

export const useInkassoMarkieren = (rechnungId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Rechnung>(`/rechnungen/${rechnungId}/inkasso-markieren`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.rechnung(rechnungId) });
      qc.invalidateQueries({ queryKey: ["rechnungen"] });
    },
  });
};

// ---------- Google Drive ----------
export const useGoogleDrive = () =>
  useQuery({
    queryKey: qk.einstellungen.googleDrive,
    queryFn: () => api.get<GoogleDriveEinstellungen>("/einstellungen/google-drive"),
  });

export const useUpdateGoogleDrive = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<GoogleDriveEinstellungen>) =>
      api.patch<GoogleDriveEinstellungen>("/einstellungen/google-drive", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.einstellungen.googleDrive }),
  });
};

export const useConnectGoogleDrive = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { kontoEmail: string }) =>
      api.post<GoogleDriveEinstellungen>("/einstellungen/google-drive/connect", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.einstellungen.googleDrive }),
  });
};

export const useDisconnectGoogleDrive = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<GoogleDriveEinstellungen>("/einstellungen/google-drive/disconnect"),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.einstellungen.googleDrive }),
  });
};

export const useTestGoogleDrive = () =>
  useMutation({
    mutationFn: () =>
      api.post<{ erfolg: boolean; nachricht: string; webViewLink?: string }>(
        "/einstellungen/google-drive/test",
      ),
  });

// ---------- Backup-Historie & Live-Status & Sitzungen ----------
export const useBackupHistorie = () =>
  useQuery({
    queryKey: qk.einstellungen.backupHistorie,
    queryFn: () => api.get<BackupEintrag[]>("/backup/historie"),
  });

export type BackupInArbeit = BackupEintrag & {
  phase: "queued" | "snapshot" | "archive" | "checksum" | "finalize" | "done" | "error";
  percent: number;
  message?: string;
};

/** Live-Pollt laufende Backups (alle 800 ms wenn welche aktiv sind). */
export const useBackupInArbeit = () =>
  useQuery({
    queryKey: ["backup", "in-arbeit"] as const,
    queryFn: () => api.get<BackupInArbeit[]>("/backup/in-arbeit"),
    refetchInterval: (q) => ((q.state.data?.length ?? 0) > 0 ? 800 : false),
  });

export type RestoreStatus = {
  restore: {
    id: string;
    phase: "queued" | "safety-backup" | "extract" | "swap" | "verify" | "done" | "rollback" | "error";
    percent: number;
    message?: string;
    startedAt: string;
    finishedAt?: string;
  } | null;
  maintenance: { active: boolean; reason?: string; since?: string };
};

/** Pollt Restore-Status. Auch im Wartungsmodus erreichbar. */
export const useRestoreStatus = (enabled = true) =>
  useQuery({
    queryKey: ["backup", "restore-status"] as const,
    queryFn: () => api.get<RestoreStatus>("/backup/restore-status"),
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d) return enabled ? 1500 : false;
      if (d.maintenance.active) return 1000;
      if (d.restore && d.restore.phase !== "done" && d.restore.phase !== "error") return 800;
      return false;
    },
    enabled,
  });


export const useSitzungen = () =>
  useQuery({
    queryKey: qk.einstellungen.sitzungen,
    queryFn: () => api.get<SitzungEintrag[]>("/einstellungen/sitzungen"),
  });

export const useAlleSitzungenBeenden = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>("/einstellungen/sitzungen/alle-beenden"),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.einstellungen.sitzungen }),
  });
};


// ---------- System & Updates ----------

/** Backend liefert installedAt evtl. als SQLite-Format "YYYY-MM-DD HH:MM:SS". */
function adaptSystemInfo(s: SystemInfo): SystemInfo {
  const iso = s.installedAt && !s.installedAt.includes("T")
    ? s.installedAt.replace(" ", "T") + "Z"
    : s.installedAt;
  return { ...s, installedAt: iso };
}

export const useSystemInfo = () =>
  useQuery({
    queryKey: qk.einstellungen.systemInfo,
    queryFn: async () => adaptSystemInfo(await api.get<SystemInfo>("/system/info")),
  });

export const useUpdateHistorie = () =>
  useQuery({
    queryKey: qk.einstellungen.updateHistorie,
    queryFn: () => api.get<InstallierteVersion[]>("/system/update/historie"),
  });

/**
 * Validiert ein hochgeladenes Update-Paket via Multipart-Upload.
 * Backend: POST /system/update/validate, field=paket (file).
 * Mock akzeptiert sowohl FormData (Pi-konform) als auch JSON-Fallback.
 */
export const useValidateUpdate = () =>
  useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("paket", file, file.name);
      // Direkt über piApi, weil Multipart vom Mock-Pfad nicht serialisiert wird.
      // api.post leitet bei /system/* ohnehin auf piApi weiter; wir nutzen piApi
      // direkt, damit der Mock-Fallback (offline + keine Backend-URL) klappt.
      try {
        return await piApi.post<UpdatePackageInfo>("/system/update/validate", fd);
      } catch (e) {
        // Mock-Fallback nur wenn Backend offline (status 0). In allen anderen
        // Fällen Fehler unverändert weiterreichen, damit die UI ihn anzeigen kann.
        if (e instanceof PiApiError && e.status === 0) {
          return api.post<UpdatePackageInfo>("/system/update/validate", {
            fileName: file.name,
            sizeBytes: file.size,
          });
        }
        throw e;
      }
    },
  });

export const useInstallUpdate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uploadId: string) =>
      api.post<UpdateLauf>(`/system/update/install/${uploadId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.einstellungen.systemInfo });
      qc.invalidateQueries({ queryKey: qk.einstellungen.updateHistorie });
    },
  });
};

/** Lauf-Query: SSE treibt Updates (system:update:phase). Polling nur als
 *  Sicherheitsnetz alle 10 s, solange der Lauf "laeuft" — beim Pi-Backend
 *  reicht oft das erste Refetch nach Connect. Im Mock-Modus bleibt es als
 *  Fallback erhalten. */
export const useUpdateLauf = (id: string | null) =>
  useQuery({
    queryKey: id ? qk.einstellungen.updateLauf(id) : ["system", "update", "lauf", "none"],
    queryFn: () => api.get<UpdateLauf>(`/system/update/lauf/${id}`),
    enabled: !!id,
    refetchInterval: (q) => {
      const data = q.state.data as UpdateLauf | undefined;
      if (!data) return 1500;
      return data.status === "laeuft" || data.status === "rollback" ? 10_000 : false;
    },
  });

/** Holt den ggf. laufenden Update-Lauf beim Tab-Mount. 204 → null. */
export const useAktuellerUpdateLauf = (enabled: boolean) =>
  useQuery({
    queryKey: ["system", "update", "lauf", "aktuell"],
    queryFn: async () => {
      try {
        return await api.get<UpdateLauf | null>("/system/update/lauf/aktuell");
      } catch {
        return null;
      }
    },
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });

export const useRollbackUpdate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ version, passwort }: { version: string; passwort: string }) =>
      api.post<UpdateLauf>(
        `/system/update/rollback/${encodeURIComponent(version)}`,
        { passwort },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.einstellungen.systemInfo });
      qc.invalidateQueries({ queryKey: qk.einstellungen.updateHistorie });
    },
  });
};
