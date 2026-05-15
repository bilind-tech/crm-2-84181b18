// nodemailer-Singleton für Strato-SMTP. Konservative Defaults:
//   pool=true, maxConnections=1, maxMessages=50 (Strato mag keine Bursts),
//   strikte Timeouts, TLS ≥ 1.2.
//
// resetTransport() wird vom PUT /einstellungen/smtp aufgerufen, damit nach
// Konfig-Änderung kein veralteter Transport rumliegt. Im Test-Modus liefert
// setTestTransport() einen JSON-Transport zurück, der nichts rauslässt.

import nodemailer, { type Transporter } from "nodemailer";
import { getSetting } from "../settings/store.js";
import { decryptString } from "../crypto/aes.js";
import { getDatabase } from "../db/index.js";
import { SENSITIVE_KEYS, type SmtpSettings } from "../settings/schemas.js";

let _transport: Transporter | null = null;
let _testTransport: Transporter | null = null;

export function setTestTransport(t: Transporter | null): void {
  _testTransport = t;
  _transport = null;
}

export function resetTransport(): void {
  if (_transport) {
    try { _transport.close(); } catch { /* ignore */ }
  }
  _transport = null;
}

export function readSmtpPassword(): string | null {
  const row = getDatabase()
    .prepare(`SELECT value, encrypted FROM setting WHERE key = ?`)
    .get(SENSITIVE_KEYS.smtpPassword) as { value: string; encrypted: number } | undefined;
  if (!row) return null;
  const raw = row.encrypted ? decryptString(row.value) : row.value;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") return parsed;
    if (parsed && typeof (parsed as { password?: unknown }).password === "string") {
      return (parsed as { password: string }).password;
    }
    return raw;
  } catch {
    return raw;
  }
}

export interface SmtpRuntime {
  smtp: SmtpSettings;
  passwordIsSet: boolean;
  fromEmail: string;
  fromName: string;
}

export function loadSmtpRuntime(): SmtpRuntime | null {
  const smtp = getSetting<SmtpSettings>("smtp");
  if (!smtp) return null;
  const password = readSmtpPassword();
  return {
    smtp,
    passwordIsSet: !!password,
    fromEmail: smtp.fromEmail || smtp.user,
    fromName: smtp.fromName || smtp.fromEmail || smtp.user,
  };
}

function buildTransport(): Transporter {
  const rt = loadSmtpRuntime();
  if (!rt) throw new Error("SMTP nicht konfiguriert");
  const password = readSmtpPassword();
  if (!password) throw new Error("SMTP-Passwort nicht gesetzt");
  return nodemailer.createTransport({
    host: rt.smtp.host,
    port: rt.smtp.port,
    secure: rt.smtp.secure,
    auth: { user: rt.smtp.user, pass: password },
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    tls: { minVersion: "TLSv1.2", servername: rt.smtp.host },
  });
}

export function getTransport(): Transporter {
  if (_testTransport) return _testTransport;
  if (_transport) return _transport;
  _transport = buildTransport();
  return _transport;
}

/** Verbindungs-/Auth-Test ohne Versand. Wirft mit `code` bei Fehler. */
export async function verifyTransport(): Promise<{ ok: true; latencyMs: number }> {
  const transport = _testTransport ?? buildTransport();
  const t0 = Date.now();
  try {
    await transport.verify();
    return { ok: true, latencyMs: Date.now() - t0 };
  } finally {
    if (transport !== _testTransport) {
      try { transport.close(); } catch { /* ignore */ }
    }
  }
}

export interface FromAddress {
  name: string;
  address: string;
}

export function getFromAddress(): FromAddress {
  const rt = loadSmtpRuntime();
  if (!rt || !rt.fromEmail) throw new Error("Absenderadresse fehlt");
  return { name: rt.fromName, address: rt.fromEmail };
}
