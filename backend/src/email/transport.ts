// nodemailer-Singleton. Baut Transport aus Settings.
// reset() wird vom PUT /einstellungen/smtp aufgerufen, damit nach Konfig-Änderung
// kein veralteter Transport rumliegt.
//
// Im Test-Modus liefert getTestTransport() einen JSON-Transport zurück, der nichts
// rauslässt — siehe email.spec.ts.

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
  _transport = null;
}

function readSmtpPassword(): string | null {
  const row = getDatabase()
    .prepare(`SELECT value, encrypted FROM setting WHERE key = ?`)
    .get(SENSITIVE_KEYS.smtpPassword) as { value: string; encrypted: number } | undefined;
  if (!row) return null;
  const raw = row.encrypted ? decryptString(row.value) : row.value;
  try { return (JSON.parse(raw) as { password?: string }).password ?? raw; }
  catch { return raw; }
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

export function getTransport(): Transporter {
  if (_testTransport) return _testTransport;
  if (_transport) return _transport;
  const rt = loadSmtpRuntime();
  if (!rt) throw new Error("SMTP nicht konfiguriert");
  const password = readSmtpPassword();
  if (!password) throw new Error("SMTP-Passwort nicht gesetzt");
  _transport = nodemailer.createTransport({
    host: rt.smtp.host,
    port: rt.smtp.port,
    secure: rt.smtp.secure,
    auth: { user: rt.smtp.user, pass: password },
  });
  return _transport;
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
