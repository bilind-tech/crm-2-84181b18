// Drive-Worker: pollt drive_upload_queue und lädt PDFs hoch.
import cron from "node-cron";
import crypto from "node:crypto";
import { claimDue, markErfolg, markFehler, type DriveUpload } from "./upload-repo.js";
import { renderAngebotPdf, renderRechnungPdf } from "../pdf/belegPdf.server.js";
import { ensureMonthFolder, uploadFile } from "./folders.js";
import { getAngebot } from "../belege/angebote-repo.js";
import { getRechnung } from "../belege/rechnungen-repo.js";
import { setStatusError, setStatusOk, loadDriveSettings } from "./oauth.js";

let started = false;
let isRunning = false;

interface DriveUploaderHooks {
  uploadFn?: typeof uploadFile;
  ensureFolder?: typeof ensureMonthFolder;
}
let hooks: DriveUploaderHooks = {};
export function setDriveTestHooks(h: DriveUploaderHooks): void { hooks = h; }

async function processOne(row: DriveUpload): Promise<void> {
  const pdf = row.belegArt === "angebot"
    ? await renderAngebotPdf(row.belegId)
    : await renderRechnungPdf(row.belegId);
  if (!pdf) throw new Error(`Beleg ${row.belegArt}/${row.belegId} nicht gefunden`);

  const sha = crypto.createHash("sha256").update(pdf.buffer).digest("hex");
  // Datum: Versanddatum (Rechnung.versendetAm) bzw. erstelltAm
  const beleg = row.belegArt === "angebot" ? getAngebot(row.belegId) : getRechnung(row.belegId);
  const dateStr = (beleg as { versendetAm?: string; erstelltAm?: string } | null)?.versendetAm
    ?? (beleg as { erstelltAm?: string } | null)?.erstelltAm
    ?? new Date().toISOString();
  const d = new Date(dateStr);
  const jahr = d.getUTCFullYear();
  const monat = d.getUTCMonth() + 1;

  const folderId = await (hooks.ensureFolder ?? ensureMonthFolder)(row.belegArt, jahr, monat);
  const out = await (hooks.uploadFn ?? uploadFile)({
    parentFolderId: folderId,
    name: row.dateiName,
    data: pdf.buffer,
    mimeType: "application/pdf",
  });
  markErfolg(row.id, out.id, out.webViewLink);
  setStatusOk();
  // sha-Match nicht zwingend für Erfolg, wir loggen aber falls divergent.
  if (sha !== row.pdfSha256) {
    // PDF wurde zwischenzeitlich neu gerendert — nicht kritisch.
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
        const msg = e instanceof Error ? e.message : String(e);
        markFehler(row.id, msg);
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
