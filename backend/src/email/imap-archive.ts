// IMAP-Append in den Sent-/Gesendet-Ordner des SMTP-Postfachs.
//
// HARTE REGEL: Diese Datei darf den SMTP-Versand NIEMALS scheitern lassen.
// Aufrufer ruft `archiveToSentFolder(...)` strikt fire-and-forget auf
// (`void archiveToSentFolder(...).catch(() => {})`). Jeder Fehler hier wird
// nur ins `email_versand`-Audit-Feld geschrieben, nie in den Send-Status.
//
// Credentials werden 1:1 vom SMTP-Setting wiederverwendet (gleicher User,
// gleiches Passwort). IMAP-Host wird vom SMTP-Host abgeleitet
// (`smtp.X` -> `imap.X`, mit Spezialfall Strato).

import { ImapFlow, type ListResponse } from "imapflow";
import { loadSmtpRuntime, readSmtpPassword } from "./transport.js";
import { getDatabase } from "../db/index.js";

const IMAP_OP_TIMEOUT_MS = 15_000;
const FALLBACK_FOLDER_NAMES = [
  "Sent",
  "Gesendet",
  "Gesendete Elemente",
  "Gesendete Objekte",
  "INBOX.Sent",
  "INBOX.Gesendet",
];

let _client: ImapFlow | null = null;
let _connecting: Promise<ImapFlow> | null = null;
let _cachedSentFolder: string | null = null;

function deriveImapHost(smtpHost: string): string {
  const h = smtpHost.trim().toLowerCase();
  if (!h) return "";
  if (h === "smtp.strato.de") return "imap.strato.de";
  if (h.startsWith("smtp.")) return "imap." + h.slice("smtp.".length);
  return h; // Fallback: gleicher Host
}

function buildClient(): ImapFlow {
  const rt = loadSmtpRuntime();
  if (!rt) throw new Error("SMTP nicht konfiguriert");
  const password = readSmtpPassword();
  if (!password) throw new Error("SMTP-Passwort nicht gesetzt");
  const host = deriveImapHost(rt.smtp.host);
  if (!host) throw new Error("IMAP-Host nicht ableitbar");
  return new ImapFlow({
    host,
    port: 993,
    secure: true,
    auth: { user: rt.smtp.user, pass: password },
    logger: false,
    tls: { minVersion: "TLSv1.2", servername: host },
    // Konservative Timeouts; passen zu Strato-Verhalten.
    socketTimeout: 30_000,
  });
}

async function getClient(): Promise<ImapFlow> {
  if (_client && _client.usable) return _client;
  if (_connecting) return _connecting;
  _connecting = (async () => {
    const c = buildClient();
    c.on("error", () => { /* silent — wir reconnecten lazy */ });
    c.on("close", () => {
      if (_client === c) {
        _client = null;
        _cachedSentFolder = null;
      }
    });
    await c.connect();
    _client = c;
    return c;
  })();
  try {
    return await _connecting;
  } finally {
    _connecting = null;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout (${label}, ${ms}ms)`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function findSentFolder(client: ImapFlow): Promise<string> {
  if (_cachedSentFolder) return _cachedSentFolder;
  const list = await client.list() as ListResponse[];
  // 1) SPECIAL-USE \Sent
  const bySpecial = list.find((f) => {
    const flags = (f.flags ?? new Set<string>()) as Set<string>;
    const sf = (f as ListResponse & { specialUse?: string }).specialUse;
    return sf === "\\Sent" || flags.has("\\Sent");
  });
  if (bySpecial) { _cachedSentFolder = bySpecial.path; return bySpecial.path; }
  // 2) Bekannte Namen
  for (const name of FALLBACK_FOLDER_NAMES) {
    const hit = list.find((f) => f.path === name || f.name === name);
    if (hit) { _cachedSentFolder = hit.path; return hit.path; }
  }
  // 3) Heuristik
  const heuristic = list.find((f) => /sent|gesendet/i.test(f.path) || /sent|gesendet/i.test(f.name));
  if (heuristic) { _cachedSentFolder = heuristic.path; return heuristic.path; }
  throw new Error("Kein Sent-/Gesendet-Ordner gefunden");
}

function markArchived(versandId: string): void {
  try {
    getDatabase().prepare(
      `UPDATE email_versand
         SET imap_archived = 1, imap_archive_fehler = NULL, geaendert_am = datetime('now')
       WHERE id = ?`,
    ).run(versandId);
  } catch { /* best-effort */ }
}

function markArchiveError(versandId: string, message: string): void {
  try {
    getDatabase().prepare(
      `UPDATE email_versand
         SET imap_archive_fehler = ?, geaendert_am = datetime('now')
       WHERE id = ?`,
    ).run(message.slice(0, 1000), versandId);
  } catch { /* best-effort */ }
}

function isAlreadyArchived(versandId: string): boolean {
  try {
    const r = getDatabase()
      .prepare(`SELECT imap_archived FROM email_versand WHERE id = ?`)
      .get(versandId) as { imap_archived?: number } | undefined;
    return !!r && r.imap_archived === 1;
  } catch {
    return false;
  }
}

/**
 * Hängt eine bereits per SMTP versendete Mail an den Sent-Ordner an.
 * - Idempotent: wenn schon archiviert -> No-Op.
 * - Wirft NIE nach außen; Fehler werden nur protokolliert.
 */
export async function archiveToSentFolder(
  versandId: string,
  rawMime: Buffer,
): Promise<void> {
  if (isAlreadyArchived(versandId)) return;
  try {
    const client = await withTimeout(getClient(), IMAP_OP_TIMEOUT_MS, "imap.connect");
    const folder = await withTimeout(findSentFolder(client), IMAP_OP_TIMEOUT_MS, "imap.list");
    await withTimeout(
      client.append(folder, rawMime, ["\\Seen"], new Date()),
      IMAP_OP_TIMEOUT_MS,
      "imap.append",
    );
    markArchived(versandId);
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    markArchiveError(versandId, msg);
    // Beim nächsten Aufruf wollen wir frisch verbinden, falls die Session tot ist.
    if (_client && !_client.usable) _client = null;
  }
}

/** Verwirft die offene IMAP-Session — z. B. nach Konfig-Änderung. */
export function resetImapClient(): void {
  const c = _client;
  _client = null;
  _cachedSentFolder = null;
  if (c) { void c.logout().catch(() => { /* ignore */ }); }
}

export interface VerifyImapResult {
  ok: true;
  latencyMs: number;
  sentFolder: string;
  host: string;
}

/** Verbindungstest (ohne Append) — für den optionalen Test-Button. */
export async function verifyImap(): Promise<VerifyImapResult> {
  const t0 = Date.now();
  const rt = loadSmtpRuntime();
  if (!rt) throw new Error("SMTP nicht konfiguriert");
  const host = deriveImapHost(rt.smtp.host);
  const c = buildClient();
  try {
    await withTimeout(c.connect(), IMAP_OP_TIMEOUT_MS, "imap.connect");
    const folder = await withTimeout(findSentFolder(c), IMAP_OP_TIMEOUT_MS, "imap.list");
    return { ok: true, latencyMs: Date.now() - t0, sentFolder: folder, host };
  } finally {
    try { await c.logout(); } catch { /* ignore */ }
  }
}