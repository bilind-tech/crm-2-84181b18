// API-Shapes (camelCase) für Dokumente + Upload-Sessions.
// Spiegelt src/lib/api/types.ts.

export type DokumentTyp =
  | "beleg" | "vertrag" | "angebot" | "rechnung"
  | "protokoll" | "bild" | "sonstiges";

export type DokumentQuelle = "upload" | "drag-drop" | "handy-scan";
export type DriveSyncStatus = "pending" | "uploaded" | "fehler";

export interface DriveSyncInfo {
  status: DriveSyncStatus;
  fileId?: string | null;
  url?: string | null;
  letzterVersuchAm?: string | null;
  fehlerText?: string | null;
}

export interface Dokument {
  id: string;
  titel: string;
  beschreibung?: string | null;
  typ: DokumentTyp;
  kundeId?: string | null;
  objektId?: string | null;
  ordnerId?: string | null;
  uploadSessionId?: string | null;
  dateiname: string;
  mimeType: string;
  groesseBytes: number;
  sha256: string;
  /** Server-relative Datei-URL; Frontend lädt mit Auth-Cookie. */
  url: string;
  dokumentdatum?: string | null;
  betrag?: number | null;
  steuerrelevant: boolean;
  ustSatz?: number | null;
  faelligAm?: string | null;
  erledigtAm?: string | null;
  quelle: DokumentQuelle;
  drive?: DriveSyncInfo | null;
  hochgeladenAm: string;
}

export interface DokumentMetaInput {
  titel?: string;
  beschreibung?: string | null;
  typ?: DokumentTyp;
  kundeId?: string | null;
  objektId?: string | null;
  ordnerId?: string | null;
  dokumentdatum?: string | null;
  betrag?: number | null;
  steuerrelevant?: boolean;
  ustSatz?: number | null;
  faelligAm?: string | null;
  quelle?: DokumentQuelle;
  uploadSessionId?: string | null;
}

export interface DokumentListFilter {
  kundeId?: string;
  objektId?: string;
  ordnerId?: string | null;
  /** Wenn true UND ordnerId gesetzt: rekursiv inkl. Unterordner. */
  recursive?: boolean;
  typ?: DokumentTyp;
  jahr?: number;
  /** Nur nicht-erledigte. */
  offen?: boolean;
  /** Nur steuerrelevante. */
  steuer?: boolean;
}

export interface UploadSession {
  id: string;
  token: string;
  kundeId?: string | null;
  objektId?: string | null;
  erstelltAm: string;
  ablaufAm: string;
  beendet: boolean;
  dokumentIds: string[];
}

export interface UploadSessionPublic {
  token: string;
  kundeId?: string | null;
  objektId?: string | null;
  ablaufAm: string;
  beendet: boolean;
  dokumentIds: string[];
}

/** Erlaubte MIME-Whitelist für Uploads. */
export const ALLOWED_MIME_PREFIXES = ["image/"] as const;
export const ALLOWED_MIME_TYPES = ["application/pdf"] as const;
/** 20 MB analog Frontend `MAX_BYTES`. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
/** 60 Minuten Sessions. */
export const SESSION_TTL_MIN = 60;

export function isAllowedMime(mime: string): boolean {
  if (!mime) return false;
  if (ALLOWED_MIME_TYPES.includes(mime as (typeof ALLOWED_MIME_TYPES)[number])) return true;
  return ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p));
}
