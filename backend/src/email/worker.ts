// Email-Worker: pollt Queue alle 30 s, sendet via nodemailer-Transport.
// Bei beleg_art+beleg_id wird PDF frisch via Step-5-Renderer geholt.

import cron from "node-cron";
import { getTransport, getFromAddress, loadSmtpRuntime } from "./transport.js";
import { claimDue, markErfolg, markFehler, type EmailVersand } from "./versand-repo.js";
import { renderAngebotPdf, renderRechnungPdf } from "../pdf/belegPdf.server.js";

let started = false;
let isRunning = false;

async function sendOne(row: EmailVersand): Promise<void> {
  const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
  if (row.belegArt && row.belegId) {
    const pdf = row.belegArt === "angebot"
      ? await renderAngebotPdf(row.belegId)
      : await renderRechnungPdf(row.belegId);
    if (pdf) {
      attachments.push({
        filename: pdf.dateiname,
        content: pdf.buffer,
        contentType: "application/pdf",
      });
    }
  }
  const transport = getTransport();
  const from = getFromAddress();
  const info = await transport.sendMail({
    from: { name: from.name, address: from.address },
    to: row.empfaengerTo,
    cc: row.empfaengerCc || undefined,
    bcc: row.empfaengerBcc || undefined,
    subject: row.betreff,
    html: row.bodyHtml,
    attachments,
  });
  markErfolg(row.id, info.messageId ?? null);
}

export async function tickEmailQueue(limit = 5): Promise<{ processed: number; ok: number; failed: number }> {
  if (isRunning) return { processed: 0, ok: 0, failed: 0 };
  isRunning = true;
  let ok = 0, failed = 0;
  try {
    if (!loadSmtpRuntime()) return { processed: 0, ok: 0, failed: 0 };
    const due = claimDue(limit);
    for (const row of due) {
      try { await sendOne(row); ok++; }
      catch (e) {
        failed++;
        markFehler(row.id, e instanceof Error ? e.message : String(e));
      }
    }
    return { processed: due.length, ok, failed };
  } finally {
    isRunning = false;
  }
}

export function startEmailWorker(): void {
  if (started) return;
  started = true;
  // Alle 30 Sekunden
  cron.schedule("*/30 * * * * *", () => {
    void tickEmailQueue().catch((e) => console.error("email worker tick", e));
  });
}
