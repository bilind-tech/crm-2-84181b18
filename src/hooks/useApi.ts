// Zentrale React-Query-Hooks. Jede Entität hat ein QueryKey-Objekt + Hooks.

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { piApi, PiApiError } from "@/lib/api/piClient";
import { getBackendUrl } from "@/lib/api/backendUrl";
import { postWithProgress } from "@/lib/api/piClient";
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
  GithubInstallResult,
  GithubUpdateStatus,
  GoogleDriveEinstellungen,
  InstallierteVersion,
  Kunde,
  Notiz,
  Nummernkreise,
  Objekt,
  Positionsvorlage,
  Rechnung,
  SicherheitsEinstellungen,
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
export const useKunden = (params?: {
  q?: string;
  status?: string;
  tag?: string;
  archiviert?: boolean;
}) =>
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
    queryFn: () =>
      api.get<
        Kunde & {
          ansprechpartner: Ansprechpartner[];
          objekte: Objekt[];
          angebote: Angebot[];
          rechnungen: Rechnung[];
          dokumente: Dokument[];
          notizen: Notiz[];
        }
      >(`/kunden/${id}`),
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
    mutationFn: (arg: string | { id: string; force?: boolean }) => {
      // `force` wird vom alten Aufruf noch akzeptiert, aber ignoriert.
      // Soft-Delete ist jetzt einheitlich — Hart-Löschen nur über die Datenbank-Seite.
      const id = typeof arg === "string" ? arg : arg.id;
      return api.delete<void>(`/kunden/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.kunden });
      qc.invalidateQueries({ queryKey: qk.dashboard.kennzahlen });
    },
  });
};

// ---------- Kunden-Logo ----------
/** Liefert die absolute URL zum Logo (mit Cache-Bust). Frontend benutzt das direkt als <img src>. */
export function kundeLogoUrl(id: string, logoUpdatedAt?: string): string {
  const base = getBackendUrl();
  const bust = logoUpdatedAt ? `?v=${encodeURIComponent(logoUpdatedAt)}` : "";
  return `${base}/kunden/${id}/logo${bust}`;
}

export const useUploadKundeLogo = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file, file.name);
      return postWithProgress<Kunde>(`/kunden/${id}/logo`, fd);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.kunde(id) });
      qc.invalidateQueries({ queryKey: qk.kunden });
    },
  });
};

export const useDeleteKundeLogo = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>(`/kunden/${id}/logo`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.kunde(id) });
      qc.invalidateQueries({ queryKey: qk.kunden });
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
  useQuery({
    queryKey: qk.objekt(id),
    queryFn: () => api.get<Objekt>(`/objekte/${id}`),
    enabled: !!id,
  });

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
  useQuery({
    queryKey: qk.angebot(id),
    queryFn: () => api.get<Angebot>(`/angebote/${id}`),
    enabled: !!id,
  });

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
      qc.invalidateQueries({ queryKey: ["drive", "aktuell", "angebot", id] });
    },
  });
};
export const useDeleteAngebot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (arg: string | { id: string; force?: boolean }) => {
      const id = typeof arg === "string" ? arg : arg.id;
      return api.delete<void>(`/angebote/${id}`);
    },
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
  useQuery({
    queryKey: qk.rechnung(id),
    queryFn: () => api.get<Rechnung>(`/rechnungen/${id}`),
    enabled: !!id,
  });

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
      qc.invalidateQueries({ queryKey: ["drive", "aktuell", "rechnung", id] });
    },
  });
};
export const useDeleteRechnung = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (arg: string | { id: string; force?: boolean }) => {
      const id = typeof arg === "string" ? arg : arg.id;
      return api.delete<void>(`/rechnungen/${id}`);
    },
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
/**
 * Spiegelt rechnungStatusAuto im Backend, damit das optimistische Update den
 * Status sofort korrekt hochstuft (versendet/teilbezahlt → bezahlt).
 */
function berechneRechnungStatus(r: Rechnung): Rechnung["status"] {
  if (r.status === "storniert") return r.status;
  let netto = 0;
  let steuer = 0;
  for (const p of r.positionen) {
    const linie = p.menge * p.einzelpreisNetto * (1 - p.rabatt / 100);
    netto += linie;
    steuer += linie * (p.steuersatz / 100);
  }
  const brutto = (netto + steuer) * (1 - r.rabattGesamt / 100);
  const bezahlt = r.zahlungen.reduce((s, z) => s + z.betrag, 0);
  if (bezahlt >= brutto - 0.005 && bezahlt > 0) return "bezahlt";
  if (r.status === "entwurf") return r.status;
  if (bezahlt > 0) return "teilbezahlt";
  if (new Date(r.faelligkeitsdatum) < new Date()) return "ueberfaellig";
  return r.status;
}

function patchRechnungInCache(
  qc: QueryClient,
  rechnungId: string,
  patcher: (r: Rechnung) => Rechnung,
) {
  const detail = qc.getQueryData<Rechnung>(qk.rechnung(rechnungId));
  if (detail) qc.setQueryData<Rechnung>(qk.rechnung(rechnungId), patcher(detail));
  const listEntries = qc.getQueriesData<Rechnung[]>({ queryKey: ["rechnungen"] });
  for (const [key, list] of listEntries) {
    if (!Array.isArray(list)) continue;
    const next = list.map((r) => (r.id === rechnungId ? patcher(r) : r));
    qc.setQueryData(key, next);
  }
}

export const useAddZahlung = (rechnungId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Zahlung>) =>
      api.post<Zahlung>(`/rechnungen/${rechnungId}/zahlungen`, data),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ["rechnungen"] });
      await qc.cancelQueries({ queryKey: qk.rechnung(rechnungId) });
      const snapshotDetail = qc.getQueryData<Rechnung>(qk.rechnung(rechnungId));
      const snapshotLists = qc.getQueriesData<Rechnung[]>({ queryKey: ["rechnungen"] });
      const tempId = `tmp-${Date.now()}`;
      patchRechnungInCache(qc, rechnungId, (r) => {
        const neu: Zahlung = {
          id: tempId,
          rechnungId,
          datum: data.datum ?? new Date().toISOString().slice(0, 10),
          betrag: data.betrag ?? 0,
          methode: data.methode ?? "ueberweisung",
          referenz: data.referenz,
          notiz: data.notiz,
        };
        const next: Rechnung = { ...r, zahlungen: [...r.zahlungen, neu] };
        next.status = berechneRechnungStatus(next);
        return next;
      });
      return { snapshotDetail, snapshotLists };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      if (ctx.snapshotDetail) qc.setQueryData(qk.rechnung(rechnungId), ctx.snapshotDetail);
      for (const [key, value] of ctx.snapshotLists) {
        qc.setQueryData(key, value);
      }
    },
    onSettled: () => invalidateRechnungScope(qc, rechnungId),
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
export const useDokumente = (params?: {
  kundeId?: string;
  objektId?: string;
  /** `null` = nur lose Dokumente (Root), `string` = bestimmter Ordner, `undefined` = alle. */
  ordnerId?: string | null;
  /** Bei gesetztem ordnerId: rekursiv inkl. Unterordner. */
  recursive?: boolean;
}) =>
  useQuery({
    queryKey: [
      ...qk.dokumente(params?.kundeId),
      params?.objektId ?? "all",
      params?.ordnerId === undefined ? "any" : params.ordnerId ?? "root",
      params?.recursive ? "rec" : "flat",
    ],
    queryFn: () => {
      const q = new URLSearchParams();
      if (params?.kundeId) q.set("kundeId", params.kundeId);
      if (params?.objektId) q.set("objektId", params.objektId);
      if (params?.ordnerId === null) q.set("ordnerId", "root");
      else if (typeof params?.ordnerId === "string") q.set("ordnerId", params.ordnerId);
      if (params?.recursive) q.set("recursive", "true");
      const s = q.toString();
      return api.get<Dokument[]>(`/dokumente${s ? `?${s}` : ""}`);
    },
  });
export const useDokument = (id: string | null | undefined) =>
  useQuery({
    queryKey: ["dokument", id],
    queryFn: () => api.get<Dokument>(`/dokumente/${id}`),
    enabled: !!id,
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
    refetchInterval: 1000,
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
    mutationFn: (token: string) => api.post<void>(`/upload-sessions/${token}/beenden`, {}),
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
  useQuery({
    queryKey: qk.dashboard.warnungen,
    queryFn: () => api.get<Warnung[]>("/dashboard/warnungen"),
  });

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
        "prioritaet" in it
          ? adaptBenachrichtigung(it as BackendBenachrichtigung)
          : (it as Benachrichtigung),
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
  useQuery({
    queryKey: qk.einstellungen.firma,
    queryFn: () => api.get<Firmendaten>("/einstellungen/firma"),
  });
export const useUpdateFirmendaten = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Firmendaten>) =>
      api.patch<Firmendaten>("/einstellungen/firma", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.einstellungen.firma }),
  });
};

export const useSmtp = () =>
  useQuery({
    queryKey: qk.einstellungen.smtp,
    queryFn: () => api.get<SmtpEinstellungen>("/einstellungen/smtp"),
  });
export const useUpdateSmtp = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SmtpEinstellungen> & { passwort?: string }) =>
      api.patch<SmtpEinstellungen>("/einstellungen/smtp", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.einstellungen.smtp }),
  });
};
export const useTestSmtp = () =>
  useMutation({
    mutationFn: () =>
      api.post<{ erfolg: boolean; nachricht: string; demo?: boolean }>("/einstellungen/smtp/test"),
  });

/** SMTP-Verbindungstest (verify, kein Versand) — synchron, klare Fehler-Klartexte. */
export const useVerifySmtp = () =>
  useMutation({
    mutationFn: () =>
      api.post<{
        ok: boolean;
        latencyMs?: number;
        error?: string;
        errorCode?: string;
        demo?: boolean;
      }>("/email/verify"),
  });

/** Echte Test-Mail an eine eingegebene Adresse senden (genau eine Mail, per User-Klick). */
export const useSendTestMail = () =>
  useMutation({
    mutationFn: (an: string) =>
      api.post<{
        ok: boolean;
        messageId?: string;
        error?: string;
        errorCode?: string;
        demo?: boolean;
      }>("/email/test", { an }),
  });

export const useNummernkreise = () =>
  useQuery({
    queryKey: qk.einstellungen.nummernkreise,
    queryFn: () => api.get<Nummernkreise>("/einstellungen/nummernkreise"),
  });
export const useUpdateNummernkreise = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Nummernkreise>) =>
      api.patch<Nummernkreise>("/einstellungen/nummernkreise", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.einstellungen.nummernkreise }),
  });
};

export const useSicherheit = () =>
  useQuery({
    queryKey: qk.einstellungen.sicherheit,
    queryFn: () => api.get<SicherheitsEinstellungen>("/einstellungen/sicherheit"),
  });
export const useUpdateSicherheit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SicherheitsEinstellungen>) =>
      api.patch<SicherheitsEinstellungen>("/einstellungen/sicherheit", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.einstellungen.sicherheit }),
  });
};

export const useErscheinung = () =>
  useQuery({
    queryKey: qk.einstellungen.erscheinung,
    queryFn: () => api.get<AppearanceEinstellungen>("/einstellungen/erscheinung"),
  });
export const useUpdateErscheinung = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<AppearanceEinstellungen>) =>
      api.patch<AppearanceEinstellungen>("/einstellungen/erscheinung", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.einstellungen.erscheinung }),
  });
};

export const useBackup = () =>
  useQuery({
    queryKey: qk.einstellungen.backup,
    queryFn: () => api.get<BackupEinstellungen>("/einstellungen/backup"),
  });
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
  useQuery({
    queryKey: qk.einstellungen.positionsvorlagen,
    queryFn: () => api.get<Positionsvorlage[]>("/einstellungen/positionsvorlagen"),
  });
export const useCreatePositionsvorlage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Positionsvorlage>) =>
      api.post<Positionsvorlage>("/einstellungen/positionsvorlagen", data),
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
  useQuery({
    queryKey: qk.einstellungen.textvorlagen,
    queryFn: () => api.get<Textvorlage[]>("/einstellungen/textvorlagen"),
  });
export const useCreateTextvorlage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Textvorlage>) =>
      api.post<Textvorlage>("/einstellungen/textvorlagen", data),
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
    mutationFn: (data: Partial<EmailSignatur>) =>
      api.post<EmailSignatur>("/email/signaturen", data),
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
      if (filter?.belegId) q.set("beleg_id", filter.belegId);
      if (filter?.belegTyp) q.set("beleg_art", filter.belegTyp);
      const s = q.toString();
      return api.get<EmailVersand[]>(`/email/versand${s ? `?${s}` : ""}`);
    },
  });
export const useSendEmail = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<EmailVersand>) =>
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

/** Liefert die Google-OAuth-Authorize-URL. Frontend öffnet sie in neuem Tab. */
export const useConnectGoogleDrive = () =>
  useMutation({
    mutationFn: () => api.post<{ authorizeUrl: string }>("/einstellungen/google-drive/connect"),
  });

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

// ---------- Drive-Upload-Queue ----------
export type DriveUploadStatus = "pending" | "running" | "erfolg" | "fehler" | "manuell";
export type DriveBelegArt = "angebot" | "rechnung" | "dokument";

export interface DriveUpload {
  id: string;
  belegArt: DriveBelegArt;
  belegId: string;
  dateiName: string;
  pdfSha256: string;
  idempotenzKey: string;
  status: DriveUploadStatus;
  versuche: number;
  naechsterVersuchAt?: string | null;
  driveFileId?: string | null;
  driveWebLink?: string | null;
  fehlerText?: string | null;
  abgeschlossenAm?: string | null;
  erstelltAm: string;
  geaendertAm: string;
}

export const qkDriveUploads = ["drive", "uploads"] as const;

export const useDriveUploads = (filter?: {
  status?: DriveUploadStatus;
  belegArt?: DriveBelegArt;
  belegId?: string;
  limit?: number;
}) =>
  useQuery({
    queryKey: [...qkDriveUploads, filter ?? {}] as const,
    queryFn: () => {
      const qs = new URLSearchParams();
      if (filter?.status) qs.set("status", filter.status);
      if (filter?.belegArt) qs.set("beleg_art", filter.belegArt);
      if (filter?.belegId) qs.set("beleg_id", filter.belegId);
      if (filter?.limit) qs.set("limit", String(filter.limit));
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return api.get<DriveUpload[]>(`/drive/uploads${suffix}`);
    },
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d) return false;
      return d.some((u) => u.status === "pending" || u.status === "running") ? 4000 : false;
    },
  });

export const useRetryDriveUpload = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ ok: true }>(`/drive/uploads/${id}/retry`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qkDriveUploads }),
  });
};

export const useEnqueueDriveUpload = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { belegArt: DriveBelegArt; belegId: string }) =>
      api.post<{ ok: true }>(`/drive/uploads/enqueue`, vars),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: qkDriveUploads });
      qc.invalidateQueries({ queryKey: ["drive", "aktuell", vars.belegArt, vars.belegId] });
    },
  });
};

export interface DriveAktuellResponse {
  verbunden: boolean;
  inSync: boolean;
  currentSha: string;
  latestErfolg: {
    sha: string;
    driveFileId: string | null;
    driveWebLink: string | null;
    abgeschlossenAm: string | null;
  } | null;
}

export const useDriveAktuell = (belegArt: DriveBelegArt, belegId: string) =>
  useQuery({
    queryKey: ["drive", "aktuell", belegArt, belegId] as const,
    queryFn: () =>
      api.get<DriveAktuellResponse>(
        `/drive/uploads/aktuell?belegArt=${encodeURIComponent(belegArt)}&belegId=${encodeURIComponent(belegId)}`,
      ),
    enabled: !!belegId && (belegArt === "angebot" || belegArt === "rechnung"),
    staleTime: 5_000,
  });

export interface DriveBackfillResult {
  ok: true;
  angebote: number;
  rechnungen: number;
  dokumente: number;
  skipped: number;
}
export const useDriveBackfill = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<DriveBackfillResult>(`/drive/backfill`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qkDriveUploads }),
  });
};

// ---------- Backup-Historie & Live-Status & Sitzungen ----------
export const useBackupHistorie = () =>
  useQuery({
    queryKey: qk.einstellungen.backupHistorie,
    queryFn: () => api.get<BackupEintrag[]>("/backup/historie"),
  });

export type BackupHealth = {
  letztesErfolgreichesBackup: string | null;
  alterStunden: number | null;
  warn: boolean;
  kategorie?: string;
  dateiname?: string;
};

/** Health-Status: Alter des letzten Backups + Warn-Flag (>36 h). */
export const useBackupHealth = () =>
  useQuery({
    queryKey: ["backup", "health"] as const,
    queryFn: () => api.get<BackupHealth>("/backup/health"),
    refetchInterval: 60_000,
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
    phase:
      | "queued"
      | "safety-backup"
      | "extract"
      | "swap"
      | "verify"
      | "done"
      | "rollback"
      | "error";
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

// (Sitzungs-Hooks entfernt — Single-User-Modus, keine Session-Verwaltung mehr.)

// ---------- System & Updates ----------

/** Backend liefert installedAt evtl. als SQLite-Format "YYYY-MM-DD HH:MM:SS". */
function adaptSystemInfo(s: SystemInfo): SystemInfo {
  const iso =
    s.installedAt && !s.installedAt.includes("T")
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
    mutationFn: (uploadId: string) => api.post<UpdateLauf>(`/system/update/install/${uploadId}`),
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
      api.post<UpdateLauf>(`/system/update/rollback/${encodeURIComponent(version)}`, { passwort }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.einstellungen.systemInfo });
      qc.invalidateQueries({ queryKey: qk.einstellungen.updateHistorie });
    },
  });
};

// ─── Protokolle (Übergabe / Schlüssel) ───────────────────────────────────
import type { Protokoll, ProtokollKind } from "@/lib/api/types";

const qkProtokolle = (kind?: ProtokollKind, kundeId?: string) =>
  ["protokolle", kind ?? "all", kundeId ?? "all"] as const;
const qkProtokoll = (id: string) => ["protokolle", id] as const;

export const useProtokolle = (params?: { kind?: ProtokollKind; kundeId?: string }) =>
  useQuery({
    queryKey: qkProtokolle(params?.kind, params?.kundeId),
    queryFn: () => {
      const q = new URLSearchParams();
      if (params?.kind) q.set("kind", params.kind);
      if (params?.kundeId) q.set("kundeId", params.kundeId);
      const s = q.toString();
      return api.get<Protokoll[]>(`/protokolle${s ? `?${s}` : ""}`);
    },
  });

export const useProtokoll = (id: string) =>
  useQuery({
    queryKey: qkProtokoll(id),
    queryFn: () => api.get<Protokoll>(`/protokolle/${id}`),
    enabled: !!id,
  });

export const useProtokollByDokumentId = (dokumentId: string | null | undefined) =>
  useQuery({
    queryKey: ["protokoll-by-dokument", dokumentId],
    queryFn: async () => {
      try {
        return await api.get<Protokoll>(`/protokolle/by-dokument/${dokumentId}`);
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status === 404) return null;
        throw e;
      }
    },
    enabled: !!dokumentId,
  });

export const useCreateProtokoll = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Protokoll> & { kind: ProtokollKind }) =>
      api.post<Protokoll>("/protokolle", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["protokolle"] }),
  });
};

export const useUpdateProtokoll = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Protokoll>) => api.patch<Protokoll>(`/protokolle/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qkProtokoll(id) });
      qc.invalidateQueries({ queryKey: ["protokolle"] });
    },
  });
};

export const useDeleteProtokoll = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/protokolle/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["protokolle"] }),
  });
};

export const useAbschliessenProtokoll = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      dateiname: string;
      mimeType: string;
      groesseBytes: number;
      url: string;
    }) => {
      // `url` ist eine DataURL (z. B. "data:application/pdf;base64,XXXX").
      // Mock-Backend nutzt `url` direkt, Pi-Backend erwartet `pdfBase64`.
      const base64 = data.url.includes(",") ? data.url.split(",")[1] : data.url;
      return api.post<Protokoll>(`/protokolle/${id}/abschliessen`, { ...data, pdfBase64: base64 });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qkProtokoll(id) });
      qc.invalidateQueries({ queryKey: ["protokolle"] });
      qc.invalidateQueries({ queryKey: ["dokumente"] });
    },
  });
};

// ─── GitHub-Update (One-Click aus Pi) ──────────────────────────────────────

export const qkGithub = {
  status: ["system", "github", "status"] as const,
};

export const useGithubStatus = (autoPoll = true) =>
  useQuery({
    queryKey: qkGithub.status,
    queryFn: () => piApi.get<GithubUpdateStatus>("/system/github/status"),
    refetchInterval: autoPoll ? 30 * 60_000 : false,
    refetchOnWindowFocus: false,
    staleTime: 15_000,
    refetchOnMount: "always",
  });

export const useGithubVerbinden = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { repo: string; branch: string; autoCheck: boolean; token?: string }) =>
      piApi.post<GithubUpdateStatus>("/system/github/verbinden", input),
    onSuccess: (data) => {
      qc.setQueryData(qkGithub.status, data);
    },
  });
};

export const useGithubTrennen = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => piApi.post<{ ok: boolean }>("/system/github/trennen"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qkGithub.status });
    },
  });
};

export const useGithubPruefen = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => piApi.post<GithubUpdateStatus>("/system/github/pruefen"),
    onSuccess: (data) => {
      qc.setQueryData(qkGithub.status, data);
    },
  });
};

export const useGithubInstall = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => piApi.post<GithubInstallResult>("/system/github/install"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qkGithub.status });
      qc.invalidateQueries({ queryKey: ["system", "update"] });
    },
  });
};
