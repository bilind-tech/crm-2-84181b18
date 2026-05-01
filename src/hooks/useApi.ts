// Zentrale React-Query-Hooks. Jede Entität hat ein QueryKey-Objekt + Hooks.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
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
  EmailSignatur,
  EmailVersand,
  EmailVorlage,
  Firmendaten,
  GoogleDriveEinstellungen,
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
  Textvorlage,
  UmsatzPunkt,
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
    mutationFn: (data: Partial<Kunde>) => api.post<Kunde>("/kunden", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.kunden });
      qc.invalidateQueries({ queryKey: qk.dashboard.kennzahlen });
    },
  });
};

export const useUpdateKunde = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Kunde>) => api.patch<Kunde>(`/kunden/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.kunden });
      qc.invalidateQueries({ queryKey: qk.kunde(id) });
    },
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["angebote"] });
      qc.invalidateQueries({ queryKey: qk.dashboard.kennzahlen });
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

export const useCreateRechnung = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Rechnung>) => api.post<Rechnung>("/rechnungen", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rechnungen"] });
      qc.invalidateQueries({ queryKey: qk.dashboard.kennzahlen });
    },
  });
};
export const useUpdateRechnung = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Rechnung>) => api.patch<Rechnung>(`/rechnungen/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rechnungen"] });
      qc.invalidateQueries({ queryKey: qk.rechnung(id) });
    },
  });
};
export const useDeleteRechnung = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/rechnungen/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rechnungen"] }),
  });
};
export const useSendeRechnung = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>(`/rechnungen/${id}/senden`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.rechnung(id) });
      qc.invalidateQueries({ queryKey: ["rechnungen"] });
    },
  });
};
export const useAddZahlung = (rechnungId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Zahlung>) => api.post<Zahlung>(`/rechnungen/${rechnungId}/zahlungen`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.rechnung(rechnungId) });
      qc.invalidateQueries({ queryKey: ["rechnungen"] });
      qc.invalidateQueries({ queryKey: qk.dashboard.kennzahlen });
      qc.invalidateQueries({ queryKey: qk.aktivitaeten });
    },
  });
};
export const useDeleteZahlung = (rechnungId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (zahlungId: string) =>
      api.delete<void>(`/rechnungen/${rechnungId}/zahlungen/${zahlungId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.rechnung(rechnungId) });
      qc.invalidateQueries({ queryKey: ["rechnungen"] });
    },
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
export const useDeleteDokument = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/dokumente/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dokumente"] }),
  });
};

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
export const useDashboardKennzahlen = () =>
  useQuery({ queryKey: qk.dashboard.kennzahlen, queryFn: () => api.get<DashboardKennzahlen>("/dashboard/kennzahlen") });
export const useUmsatz = () =>
  useQuery({ queryKey: qk.dashboard.umsatz, queryFn: () => api.get<UmsatzPunkt[]>("/dashboard/umsatz") });
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
export const useAktivitaeten = () =>
  useQuery({ queryKey: qk.aktivitaeten, queryFn: () => api.get<Aktivitaet[]>("/aktivitaeten") });

export const useBenachrichtigungen = () =>
  useQuery({
    queryKey: qk.benachrichtigungen,
    queryFn: () => api.get<Benachrichtigung[]>("/benachrichtigungen"),
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
export const useCreateBackup = () =>
  useMutation({
    mutationFn: () => api.post<{ erfolg: boolean; nachricht: string; groesseBytes?: number }>("/backup/erstellen"),
  });

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

// ---------- Backup-Historie & Sitzungen ----------
export const useBackupHistorie = () =>
  useQuery({
    queryKey: qk.einstellungen.backupHistorie,
    queryFn: () => api.get<BackupEintrag[]>("/einstellungen/backup/historie"),
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

