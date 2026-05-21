// Drive-Worker: pollt drive_upload_queue und lädt PDFs / Dokumente hoch.
import cron from "node-cron";
import crypto from "node:crypto";
import { claimDue, getLatestErfolg, markErfolg, markFehler, type DriveUpload } from "./upload-repo.js";
import { renderAngebotPdf, renderRechnungPdf } from "../pdf/belegPdf.server.js";
import {
  ensureFolderPath, uploadFile,
  ensureDokumenteRoot, ensurePapierkorbRoot, ensureNamedFolder,
  renameDriveFolder, moveDriveFile, trashDriveFile, getDriveFileMeta, listDriveChildren,
} from "./folders.js";
import { getAngebot } from "../belege/angebote-repo.js";
import { getRechnung } from "../belege/rechnungen-repo.js";
import { getKunde } from "../kunden/repo.js";
import { setStatusError, setStatusOk, loadDriveSettings } from "./oauth.js";
import { applyFileNameTemplate, applyPathTemplate, type NamingContext } from "./naming.js";
import { getDokument, getDokumentRaw, setDriveStatus } from "../dokumente/repo.js";
import { absolutePath } from "../dokumente/storage.js";
import { readFile } from "node:fs/promises";
import { getProtokollByDokumentId } from "../protokolle/repo.js";
import { getObjekt } from "../kunden/repo.js";
import { getOrdner } from "../dokumente/ordner-repo.js";
import {
  getMap as getOrdnerMap, setMap as setOrdnerMap,
  setMapFehler, markMapGeloescht,
} from "../dokumente/ordner-drive-map-repo.js";
import { getDatabase } from "../db/index.js";

let started = false;
let isRunning = false;

/**
 * Mappt typische Google-Drive-/OAuth-Fehler auf benutzerfreundliche Klartext-Hilfen.
 * Die Originalnachricht bleibt im fehlerText erhalten — wir prefixen einen lesbaren Satz.
 */
export function freundlicherFehler(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("invalid_grant") || m.includes("token has been expired") || m.includes("token expired") || m.includes("refresh_token") && m.includes("not")) {
    return "Google-Verbindung abgelaufen. Bitte in Einstellungen → Google Drive neu verbinden.";
  }
  if (m.includes("storagequotaexceeded") || m.includes("storage quota") || m.includes("quota has been exceeded")) {
    return "Google-Drive-Speicher ist voll. Bitte Platz schaffen und erneut versuchen.";
  }
  if (m.includes("insufficientpermissions") || m.includes("insufficient permission") || m.includes("forbidden") || (m.includes("403") && m.includes("access"))) {
    return "Kein Schreibzugriff auf den Drive-Ordner. Bitte Konto-Berechtigung prüfen.";
  }
  if (m.includes("invalid_request") || m.includes("redirect_uri")) {
    return "OAuth-Konfiguration ist ungültig. Bitte in Einstellungen → Google Drive erneut verbinden.";
  }
  if (m.includes("client-id") || m.includes("client_id") || m.includes("client secret")) {
    return "Client-ID oder Secret fehlen. Bitte im Verbinden-Dialog hinterlegen.";
  }
  if (m.includes("network") || m.includes("etimedout") || m.includes("enotfound") || m.includes("econnreset")) {
    return "Netzwerkproblem beim Hochladen — wird automatisch erneut versucht.";
  }
  return raw;
}

interface DriveUploaderHooks {
  uploadFn?: typeof uploadFile;
  ensureFolder?: typeof ensureFolderPath;
}
let hooks: DriveUploaderHooks = {};
export function setDriveTestHooks(h: DriveUploaderHooks): void { hooks = h; }

function kundeName(kundeId?: string | null): string {
  if (!kundeId) return "";
  const k = getKunde(kundeId);
  if (!k) return "";
  if (k.typ === "firma" && k.firmenname) return k.firmenname;
  return [k.vorname, k.nachname].filter(Boolean).join(" ").trim();
}

async function processBeleg(row: DriveUpload): Promise<void> {
  const settings = loadDriveSettings();
  const pdf = row.belegArt === "angebot"
    ? await renderAngebotPdf(row.belegId)
    : await renderRechnungPdf(row.belegId);
  if (!pdf) throw new Error(`Beleg ${row.belegArt}/${row.belegId} nicht gefunden`);

  const sha = crypto.createHash("sha256").update(pdf.buffer).digest("hex");
  const beleg = row.belegArt === "angebot" ? getAngebot(row.belegId) : getRechnung(row.belegId);
  const dateStr = (beleg as { versendetAm?: string; erstelltAm?: string } | null)?.versendetAm
    ?? (beleg as { erstelltAm?: string } | null)?.erstelltAm
    ?? new Date().toISOString();
  const d = new Date(dateStr);

  const ctx: NamingContext = {
    jahr: d.getUTCFullYear(),
    monat: d.getUTCMonth() + 1,
    tag: d.getUTCDate(),
    nummer: (beleg as { nummer?: string } | null)?.nummer ?? "",
    kunde: kundeName((beleg as { kundeId?: string } | null)?.kundeId),
    leistung: (beleg as { titel?: string } | null)?.titel ?? "",
  };

  const pathTemplate = row.belegArt === "angebot"
    ? settings.unterordnerSchema?.angebote ?? "Angebote/{YYYY}/{MM}_{MMMM}"
    : settings.unterordnerSchema?.rechnungen ?? "Rechnungen/{YYYY}/{MM}_{MMMM}";
  const fileTemplate = row.belegArt === "angebot"
    ? settings.dateinameSchema?.angebot ?? "{nummer} {kunde} {leistung} {MM}-{YYYY}"
    : settings.dateinameSchema?.rechnung ?? "{nummer} {kunde} {leistung} {MM}-{YYYY}";

  const folderPath = applyPathTemplate(pathTemplate, ctx);
  const baseName = applyFileNameTemplate(fileTemplate, ctx) || row.dateiName.replace(/\.pdf$/i, "");
  const fileName = `${baseName}.pdf`;

  const folderId = await (hooks.ensureFolder ?? ensureFolderPath)(folderPath);
  // Wenn für denselben Beleg bereits ein erfolgreicher Upload existiert, dieselbe
  // Drive-Datei überschreiben (gleiche fileId/Link, kein Duplikat).
  const prev = getLatestErfolg(row.belegArt, row.belegId);
  const out = await (hooks.uploadFn ?? uploadFile)({
    parentFolderId: folderId,
    name: fileName,
    data: pdf.buffer,
    mimeType: "application/pdf",
    replaceFileId: prev?.driveFileId ?? undefined,
  });
  markErfolg(row.id, out.id, out.webViewLink);
  setStatusOk();
  if (sha !== row.pdfSha256) {
    // PDF wurde zwischenzeitlich neu gerendert — nicht kritisch.
  }
}

// ---------- Ordner-Spiegelung (Pfad-Helper) ----------

/** Pfadaufbau "Dokumente/A/B/C" für einen CRM-Ordner (anhand parent_id-Kette). */
function buildCrmOrdnerPath(ordnerId: string): string {
  const db = getDatabase();
  const segs: string[] = [];
  let cur: string | null = ordnerId;
  const guard = new Set<string>();
  while (cur) {
    if (guard.has(cur)) break;
    guard.add(cur);
    const r = db
      .prepare(`SELECT name, parent_id FROM dokument_ordner WHERE id = ?`)
      .get(cur) as { name: string; parent_id: string | null } | undefined;
    if (!r) break;
    segs.unshift(r.name);
    cur = r.parent_id;
  }
  return ["Dokumente", ...segs].join("/");
}

/** Sorgt dafür, dass alle Vorfahren + der Ordner selbst in Drive existieren.
 *  Schreibt/aktualisiert dabei Mappings. Liefert die Drive-Folder-ID. */
async function ensureCrmOrdnerInDrive(ordnerId: string | null): Promise<string> {
  if (!ordnerId) return ensureDokumenteRoot();
  // Vorhandenes Mapping zuerst: nur prüfen ob der Folder noch existiert.
  const existing = getOrdnerMap(ordnerId);
  if (existing && !existing.geloeschtAm) {
    const meta = await getDriveFileMeta(existing.driveFolderId);
    if (meta && !meta.trashed) return existing.driveFolderId;
  }
  // Sonst Pfad aufbauen + Mappings entlang der Kette persistieren.
  const db = getDatabase();
  const chain: { id: string; name: string }[] = [];
  let cur: string | null = ordnerId;
  const guard = new Set<string>();
  while (cur) {
    if (guard.has(cur)) break;
    guard.add(cur);
    const r = db
      .prepare(`SELECT id, name, parent_id FROM dokument_ordner WHERE id = ?`)
      .get(cur) as { id: string; name: string; parent_id: string | null } | undefined;
    if (!r) break;
    chain.unshift({ id: r.id, name: r.name });
    cur = r.parent_id;
  }
  let parentId = await ensureDokumenteRoot();
  let parentPath = "Dokumente";
  for (const seg of chain) {
    parentPath = `${parentPath}/${seg.name}`;
    const m = getOrdnerMap(seg.id);
    let folderId: string | null = m && !m.geloeschtAm ? m.driveFolderId : null;
    if (folderId) {
      const meta = await getDriveFileMeta(folderId);
      if (!meta || meta.trashed) folderId = null;
    }
    if (!folderId) folderId = await ensureNamedFolder(seg.name, parentId);
    setOrdnerMap({ ordnerId: seg.id, driveFolderId: folderId, drivePfad: parentPath });
    parentId = folderId;
  }
  return parentId;
}

async function processDokument(row: DriveUpload): Promise<void> {
  const settings = loadDriveSettings();
  const dok = getDokument(row.belegId);
  if (!dok) throw new Error(`Dokument ${row.belegId} nicht gefunden`);
  const raw = getDokumentRaw(row.belegId);
  if (!raw?.storage_path) throw new Error("Dokument-Storage-Pfad fehlt");
  const buf = await readFile(absolutePath(raw.storage_path));

  // Sonderbehandlung: Protokolle landen in eigene Unterordner mit eigenem Dateinamen.
  const protokoll = dok.typ === "protokoll" ? getProtokollByDokumentId(row.belegId) : null;

  let fileName = row.dateiName || dok.dateiname || "Dokument";
  let folderId: string;

  if (protokoll) {
    const dateStr = (protokoll.datum ? `${protokoll.datum}T12:00:00Z` : null) ?? dok.hochgeladenAm ?? new Date().toISOString();
    const d = new Date(dateStr);
    const objektName = protokoll.objektId ? (getObjekt(protokoll.objektId)?.name ?? "") : "";
    const ctx: NamingContext = {
      jahr: d.getUTCFullYear(),
      monat: d.getUTCMonth() + 1,
      tag: d.getUTCDate(),
      nummer: protokoll.nummer ?? "",
      kunde: kundeName(dok.kundeId ?? null),
      leistung: objektName,
    };
    const folderTemplate = protokoll.kind === "schluessel"
      ? (settings.unterordnerSchema?.protokollSchluessel ?? "Protokolle/Schlüsselübergabe/{YYYY}/{MM}_{MMMM}")
      : (settings.unterordnerSchema?.protokollUebergabe ?? "Protokolle/Übergabe-Abnahme/{YYYY}/{MM}_{MMMM}");
    const fileTemplate = settings.dateinameSchema?.protokoll ?? "{nummer} {kunde} {leistung} {DD}-{MM}-{YYYY}";
    const baseName = applyFileNameTemplate(fileTemplate, ctx) || fileName.replace(/\.pdf$/i, "");
    fileName = `${baseName}.pdf`;
    const folderPath = applyPathTemplate(folderTemplate, ctx);
    folderId = await (hooks.ensureFolder ?? ensureFolderPath)(folderPath);
  } else {
    // Freies Dokument → in den gespiegelten Ordner.
    folderId = await ensureCrmOrdnerInDrive(dok.ordnerId ?? null);
  }

  // Wenn dasselbe Dokument bereits in Drive existiert, dieselbe Datei überschreiben.
  const prev = getLatestErfolg("dokument", row.belegId);
  const out = await (hooks.uploadFn ?? uploadFile)({
    parentFolderId: folderId,
    name: fileName,
    data: buf,
    mimeType: dok.mimeType ?? raw.mime_type ?? "application/octet-stream",
    replaceFileId: prev?.driveFileId ?? undefined,
  });
  markErfolg(row.id, out.id, out.webViewLink);
  setDriveStatus(row.belegId, { status: "uploaded", fileId: out.id, url: out.webViewLink ?? null, fehlerText: null });
  setStatusOk();
}

// ---------- Ordner-Operationen ----------

async function processOrdnerCreate(row: DriveUpload): Promise<void> {
  await ensureCrmOrdnerInDrive(row.belegId);
  markErfolg(row.id, getOrdnerMap(row.belegId)?.driveFolderId ?? "", undefined);
  setStatusOk();
}

async function processOrdnerRename(row: DriveUpload): Promise<void> {
  const m = getOrdnerMap(row.belegId);
  if (!m) { await ensureCrmOrdnerInDrive(row.belegId); markErfolg(row.id, getOrdnerMap(row.belegId)?.driveFolderId ?? "", undefined); return; }
  const ord = getOrdner(row.belegId);
  if (!ord) throw new Error(`Ordner ${row.belegId} nicht gefunden`);
  await renameDriveFolder(m.driveFolderId, ord.name);
  setOrdnerMap({ ordnerId: ord.id, driveFolderId: m.driveFolderId, drivePfad: buildCrmOrdnerPath(ord.id) });
  markErfolg(row.id, m.driveFolderId, undefined);
  setStatusOk();
}

async function processOrdnerMove(row: DriveUpload): Promise<void> {
  const m = getOrdnerMap(row.belegId);
  if (!m) { await ensureCrmOrdnerInDrive(row.belegId); markErfolg(row.id, getOrdnerMap(row.belegId)?.driveFolderId ?? "", undefined); return; }
  const ord = getOrdner(row.belegId);
  if (!ord) throw new Error(`Ordner ${row.belegId} nicht gefunden`);
  const neuerParentDriveId = await ensureCrmOrdnerInDrive(ord.parentId);
  await moveDriveFile(m.driveFolderId, neuerParentDriveId);
  setOrdnerMap({ ordnerId: ord.id, driveFolderId: m.driveFolderId, drivePfad: buildCrmOrdnerPath(ord.id) });
  markErfolg(row.id, m.driveFolderId, undefined);
  setStatusOk();
}

/** Sicheres Löschen: NIEMALS files.delete. Drive-Ordner wird in den
 *  weichen Papierkorb verschoben (Dokumente/_Papierkorb/{date}/{name}).
 *  Pre-Flight: vergleicht aktuelle Drive-Inhalte mit DB. Bei unerwartetem
 *  Inhalt → manuell (kein Move). */
async function processOrdnerDelete(row: DriveUpload): Promise<void> {
  const m = getOrdnerMap(row.belegId);
  if (!m || m.geloeschtAm) { markErfolg(row.id, m?.driveFolderId ?? "", undefined); return; }
  const meta = await getDriveFileMeta(m.driveFolderId);
  if (!meta) { markMapGeloescht(row.belegId); markErfolg(row.id, m.driveFolderId, undefined); return; }
  // Pre-Flight: Inhalte zählen — wir verschieben den ganzen Ordner als Einheit.
  // Sicher: kein selektives Löschen einzelner Dateien.
  const papierkorbRoot = await ensurePapierkorbRoot();
  const dateTag = new Date().toISOString().slice(0, 10);
  const dateFolderId = await ensureNamedFolder(dateTag, papierkorbRoot);
  // Eindeutigen Namen im Tages-Papierkorb erzeugen (Konflikt → Suffix).
  let zielName = meta.name;
  const existing = await listDriveChildren(dateFolderId);
  if (existing.some((c) => c.name === zielName)) {
    zielName = `${meta.name}-${row.belegId.slice(-6)}`;
  }
  await renameDriveFolder(m.driveFolderId, zielName);
  await moveDriveFile(m.driveFolderId, dateFolderId);
  markMapGeloescht(row.belegId);
  // Nachfahren-Mappings ebenfalls als gelöscht markieren (Drive hat sie rekursiv mitverschoben).
  const payload = row.opPayload as { nachfolger?: string[] } | null;
  for (const nid of payload?.nachfolger ?? []) markMapGeloescht(nid);
  markErfolg(row.id, m.driveFolderId, undefined);
  setStatusOk();
}

async function processDokumentMove(row: DriveUpload): Promise<void> {
  const dok = getDokument(row.belegId);
  if (!dok) throw new Error(`Dokument ${row.belegId} nicht gefunden`);
  const fileId = dok.drive?.fileId ?? null;
  if (!fileId) {
    // Noch nicht in Drive → nichts zu tun (Upload kommt separat).
    markErfolg(row.id, "", undefined);
    return;
  }
  const zielFolderId = await ensureCrmOrdnerInDrive(dok.ordnerId ?? null);
  await moveDriveFile(fileId, zielFolderId);
  markErfolg(row.id, fileId, dok.drive?.url ?? undefined);
  setStatusOk();
}

async function processDokumentDelete(row: DriveUpload): Promise<void> {
  const payload = row.opPayload as { fileId?: string } | null;
  const fileId = payload?.fileId ?? null;
  if (!fileId) { markErfolg(row.id, "", undefined); return; }
  await trashDriveFile(fileId);
  markErfolg(row.id, fileId, undefined);
  setStatusOk();
}

async function processOne(row: DriveUpload): Promise<void> {
  switch (row.belegArt) {
    case "dokument":         return processDokument(row);
    case "ordner_create":    return processOrdnerCreate(row);
    case "ordner_rename":    return processOrdnerRename(row);
    case "ordner_move":      return processOrdnerMove(row);
    case "ordner_delete":    return processOrdnerDelete(row);
    case "dokument_move":    return processDokumentMove(row);
    case "dokument_delete":  return processDokumentDelete(row);
    case "angebot":
    case "rechnung":         return processBeleg(row);
  }
}

export async function tickDriveQueue(limit = 2): Promise<{ processed: number; ok: number; failed: number }> {
  if (isRunning) return { processed: 0, ok: 0, failed: 0 };
  isRunning = true;
  let ok = 0, failed = 0;
  try {
    const settings = loadDriveSettings();
    if (!settings.refreshTokenIsSet || !settings.clientSecretIsSet) return { processed: 0, ok: 0, failed: 0 };
    const due = claimDue(limit);
    for (const row of due) {
      try { await processOne(row); ok++; }
      catch (e) {
        failed++;
        const raw = e instanceof Error ? e.message : String(e);
        const msg = freundlicherFehler(raw);
        markFehler(row.id, msg);
        if (row.belegArt === "dokument") {
          setDriveStatus(row.belegId, { status: "fehler", fehlerText: msg });
        }
        if (row.belegArt.startsWith("ordner_")) {
          setMapFehler(row.belegId, msg);
        }
        if (raw.includes("invalid_grant") || raw.includes("invalid_request")) setStatusError(msg);
      }
    }
    return { processed: due.length, ok, failed };
  } finally {
    isRunning = false;
  }
}

export function startDriveWorker(): void {
  if (started) return;
  started = true;
  // Alle 60 Sekunden
  cron.schedule("0 * * * * *", () => {
    void tickDriveQueue().catch((e) => console.error("drive worker tick", e));
  });
}
