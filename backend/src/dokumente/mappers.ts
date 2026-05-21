import type {
  Dokument, DriveSyncInfo, DriveSyncStatus, UploadSession, UploadSessionPublic,
} from "./types.js";

export interface DokumentRow {
  id: string;
  titel: string;
  beschreibung: string | null;
  typ: string;
  kunde_id: string | null;
  objekt_id: string | null;
  ordner_id: string | null;
  upload_session_id: string | null;
  dateiname: string;
  mime_type: string;
  groesse_bytes: number;
  sha256: string;
  storage_path: string;
  dokumentdatum: string | null;
  betrag: number | null;
  steuerrelevant: number;
  ust_satz: number | null;
  faellig_am: string | null;
  erledigt_am: string | null;
  quelle: string;
  drive_status: string | null;
  drive_file_id: string | null;
  drive_url: string | null;
  drive_letzter_versuch: string | null;
  drive_fehler: string | null;
  hochgeladen_am: string;
  geloescht_am: string | null;
}

function toIso(s: string | null): string | null {
  if (!s) return s;
  if (s.includes("T")) return s;
  return s.replace(" ", "T") + "Z";
}

export function rowToDokument(r: DokumentRow): Dokument {
  const drive: DriveSyncInfo | null = r.drive_status
    ? {
        status: r.drive_status as DriveSyncStatus,
        fileId: r.drive_file_id,
        url: r.drive_url,
        letzterVersuchAm: toIso(r.drive_letzter_versuch),
        fehlerText: r.drive_fehler,
      }
    : null;
  return {
    id: r.id,
    titel: r.titel,
    beschreibung: r.beschreibung,
    typ: r.typ as Dokument["typ"],
    kundeId: r.kunde_id,
    objektId: r.objekt_id,
    ordnerId: r.ordner_id,
    uploadSessionId: r.upload_session_id,
    dateiname: r.dateiname,
    mimeType: r.mime_type,
    groesseBytes: r.groesse_bytes,
    sha256: r.sha256,
    url: `/dokumente/${r.id}/datei`,
    dokumentdatum: r.dokumentdatum,
    betrag: r.betrag,
    steuerrelevant: r.steuerrelevant === 1,
    ustSatz: r.ust_satz,
    faelligAm: r.faellig_am,
    erledigtAm: toIso(r.erledigt_am),
    quelle: r.quelle as Dokument["quelle"],
    drive,
    hochgeladenAm: toIso(r.hochgeladen_am)!,
  };
}

export interface UploadSessionRow {
  id: string;
  token: string;
  kunde_id: string | null;
  objekt_id: string | null;
  erstellt_am: string;
  ablauf_am: string;
  beendet: number;
}

export function rowToUploadSession(r: UploadSessionRow, dokumentIds: string[]): UploadSession {
  return {
    id: r.id,
    token: r.token,
    kundeId: r.kunde_id,
    objektId: r.objekt_id,
    erstelltAm: toIso(r.erstellt_am)!,
    ablaufAm: toIso(r.ablauf_am)!,
    beendet: r.beendet === 1,
    dokumentIds,
  };
}

export function toPublicSession(s: UploadSession): UploadSessionPublic {
  return {
    token: s.token,
    kundeId: s.kundeId,
    objektId: s.objektId,
    ablaufAm: s.ablaufAm,
    beendet: s.beendet,
    dokumentIds: s.dokumentIds,
  };
}
