// Drive-Worker: pollt drive_upload_queue und lädt PDFs / Dokumente hoch.
import cron from "node-cron";
import crypto from "node:crypto";
import { claimDue, markErfolg, markFehler, type DriveUpload } from "./upload-repo.js";
import { renderAngebotPdf, renderRechnungPdf } from "../pdf/belegPdf.server.js";
import { ensureFolderPath, uploadFile } from "./folders.js";
import { getAngebot } from "../belege/angebote-repo.js";
import { getRechnung } from "../belege/rechnungen-repo.js";
import { getKunde } from "../kunden/repo.js";
import { setStatusError, setStatusOk, loadDriveSettings } from "./oauth.js";
import { applyFileNameTemplate, applyPathTemplate, type NamingContext } from "./naming.js";
import { getDokument, getDokumentRaw, setDriveStatus } from "../dokumente/repo.js";
import { absolutePath } from "../dokumente/storage.js";
import { readFile } from "node:fs/promises";

let started = false;
let isRunning = false;

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
    ? settings.unterordnerSchema?.angebote ?? "Angebote/{YYYY}/{MM}"
    : settings.unterordnerSchema?.rechnungen ?? "Rechnungen/{YYYY}/{MM}";
  const fileTemplate = row.belegArt === "angebot"
    ? settings.dateinameSchema?.angebot ?? "{nummer} {kunde} {leistung} {MM}-{YYYY}"
    : settings.dateinameSchema?.rechnung ?? "{nummer} {kunde} {leistung} {MM}-{YYYY}";

  const folderPath = applyPathTemplate(pathTemplate, ctx);
  const baseName = applyFileNameTemplate(fileTemplate, ctx) || row.dateiName.replace(/\.pdf$/i, "");
  const fileName = `${baseName}.pdf`;

  const folderId = await (hooks.ensureFolder ?? ensureFolderPath)(folderPath);
  const out = await (hooks.uploadFn ?? uploadFile)({
    parentFolderId: folderId,
    name: fileName,
    data: pdf.buffer,
    mimeType: "application/pdf",
  });
  markErfolg(row.id, out.id, out.webViewLink);
  setStatusOk();
  if (sha !== row.pdfSha256) {
    // PDF wurde zwischenzeitlich neu gerendert — nicht kritisch.
  }
}

async function processDokument(row: DriveUpload): Promise<void> {
  const settings = loadDriveSettings();
  const dok = getDokument(row.belegId);
  if (!dok) throw new Error(`Dokument ${row.belegId} nicht gefunden`);
  const raw = getDokumentRaw(row.belegId);
  if (!raw?.storage_path) throw new Error("Dokument-Storage-Pfad fehlt");
  const buf = await readFile(absolutePath(raw.storage_path));

  const dateStr = dok.erstelltAm ?? new Date().toISOString();
  const d = new Date(dateStr);
  const ctx: NamingContext = {
    jahr: d.getUTCFullYear(),
    monat: d.getUTCMonth() + 1,
    tag: d.getUTCDate(),
    nummer: "",
    kunde: kundeName(dok.kundeId ?? null),
    leistung: dok.titel ?? dok.dateiname ?? "",
  };
  const folderPath = applyPathTemplate(
    settings.unterordnerSchema?.dokumente ?? "Dokumente/{YYYY}/{MM}",
    ctx,
  );
  const folderId = await (hooks.ensureFolder ?? ensureFolderPath)(folderPath);
  const out = await (hooks.uploadFn ?? uploadFile)({
    parentFolderId: folderId,
    name: row.dateiName || dok.dateiname || "Dokument",
    data: buf,
    mimeType: dok.mimeType ?? raw.mime_type ?? "application/octet-stream",
  });
  markErfolg(row.id, out.id, out.webViewLink);
  setDriveStatus(row.belegId, { status: "uploaded", fileId: out.id, url: out.webViewLink ?? null, fehlerText: null });
  setStatusOk();
}

async function processOne(row: DriveUpload): Promise<void> {
  if (row.belegArt === "dokument") return processDokument(row);
  return processBeleg(row);
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
        const msg = e instanceof Error ? e.message : String(e);
        markFehler(row.id, msg);
        if (row.belegArt === "dokument") {
          setDriveStatus(row.belegId, { status: "fehler", fehlerText: msg });
        }
        if (msg.includes("invalid_grant") || msg.includes("invalid_request")) setStatusError(msg);
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
