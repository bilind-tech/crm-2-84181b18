// Email-Sender — KEIN Cron, KEIN Polling, KEIN Hintergrund-Worker.
//
// ABSOLUTE REGEL: Mails gehen ausschließlich raus, wenn der User sie in der
// UI bestätigt hat. Diese Datei stellt nur eine reine `sendNow(row)`-Funktion
// bereit, die vom Versand-Endpoint synchron aufgerufen wird. Es gibt keinen
// Scheduler und auch keinen `startEmailWorker` mehr.

import { getTransport, getFromAddress } from "./transport.js";
import { markErfolg, markFehler, type EmailVersand } from "./versand-repo.js";
import { renderAngebotPdf, renderRechnungPdf, type RenderResult } from "../pdf/belegPdf.server.js";

const SEND_TIMEOUT_MS = 30_000;

interface MailSendInfo {
  messageId?: string | null;
}

export interface SendResult {
  ok: boolean;
  messageId?: string | null;
  error?: string;
  errorCode?: string;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout (${label}, ${ms}ms)`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** Sendet genau eine vorbereitete Versand-Zeile synchron. Wird nur vom
 *  /email/versand-Endpoint aufgerufen — niemals aus Cron/Hook/Trigger. */
export async function sendNow(row: EmailVersand): Promise<SendResult> {
  const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
  if (row.belegArt && row.belegId) {
    let pdf: RenderResult | null = null;
    try {
      pdf = row.belegArt === "angebot"
        ? await renderAngebotPdf(row.belegId)
        : await renderRechnungPdf(row.belegId);
    } catch (e) {
      const msg = `PDF konnte nicht erstellt werden: ${(e as Error).message ?? "Unbekannter Fehler"}`;
      markFehler(row.id, msg);
      return { ok: false, error: msg, errorCode: "PDF_RENDER_FAILED" };
    }
    if (pdf) {
      if (pdf.buffer.byteLength > 15 * 1024 * 1024) {
        const msg = "PDF-Anhang größer als 15 MB";
        markFehler(row.id, msg);
        return { ok: false, error: msg, errorCode: "ATTACHMENT_TOO_LARGE" };
      }
      attachments.push({
        filename: pdf.dateiname,
        content: pdf.buffer,
        contentType: "application/pdf",
      });
    }
  }

  try {
    const transport = getTransport();
    const from = getFromAddress();
    const info = await withTimeout<MailSendInfo>(
      transport.sendMail({
        from: { name: from.name, address: from.address },
        to: row.empfaengerTo,
        cc: row.empfaengerCc || undefined,
        bcc: row.empfaengerBcc || undefined,
        subject: row.betreff,
        html: row.bodyHtml,
        attachments,
      }),
      SEND_TIMEOUT_MS,
      "smtp.sendMail",
    );
    markErfolg(row.id, info.messageId ?? null);
    return { ok: true, messageId: info.messageId ?? null };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const code = err.code ?? "UNKNOWN";
    const msg = translateSmtpError(code, err.message ?? String(e));
    markFehler(row.id, msg);
    return { ok: false, error: msg, errorCode: code };
  }
}

/** Übersetzt nodemailer/SMTP-Fehlercodes in klare deutsche Klartext-Meldungen. */
export function translateSmtpError(code: string, raw: string): string {
  switch (code) {
    case "EAUTH":        return "Anmeldung am SMTP-Server fehlgeschlagen — Benutzername oder Passwort falsch.";
    case "ECONNECTION":
    case "ETIMEDOUT":
    case "ECONNREFUSED": return "SMTP-Server nicht erreichbar — Host, Port oder Firewall prüfen.";
    case "ESOCKET":      return "TLS-/Netzwerkfehler beim SMTP-Server — Port 465 mit aktiviertem TLS prüfen.";
    case "EDNS":         return "SMTP-Hostname konnte nicht aufgelöst werden — Schreibweise prüfen.";
    case "EENVELOPE":    return "Empfängeradresse vom SMTP-Server abgelehnt.";
    case "EMESSAGE":     return "Nachricht vom SMTP-Server abgelehnt.";
    case "ATTACHMENT_TOO_LARGE": return raw;
    default:             return raw && raw.length > 0 ? raw : "Unbekannter SMTP-Fehler.";
  }
}
