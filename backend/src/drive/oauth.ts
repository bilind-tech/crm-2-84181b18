// Google-Drive OAuth-Flow + State-Token (HMAC, 10 min TTL).
// Tokens werden via SENSITIVE_KEYS verschlüsselt gespeichert (siehe settings/store.ts).

import crypto from "node:crypto";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { getSetting, setSetting, deleteSetting } from "../settings/store.js";
import { decryptString } from "../crypto/aes.js";
import { getDatabase } from "../db/index.js";
import { SENSITIVE_KEYS, type GoogleDriveSettings } from "../settings/schemas.js";
import { readFileSync } from "node:fs";
import { config } from "../config.js";

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

interface SecretRow { value: string; encrypted: number }

function readSecret(key: string): string | null {
  const row = getDatabase().prepare(`SELECT value, encrypted FROM setting WHERE key = ?`).get(key) as SecretRow | undefined;
  if (!row) return null;
  const raw = row.encrypted ? decryptString(row.value) : row.value;
  try { return JSON.parse(raw) as string; } catch { return raw; }
}

export interface DriveSettings extends GoogleDriveSettings {
  clientSecretIsSet: boolean;
  refreshTokenIsSet: boolean;
  kontoEmail?: string;
  rootOrdnerId?: string;
  letzteSynchronisation?: string;
  letzterFehler?: string;
}

export function loadDriveSettings(): DriveSettings {
  const base = (getSetting<GoogleDriveSettings>("googleDrive") ?? {
    clientId: "",
    rootFolderName: "mycleancenter.cm",
    unterordnerSchema: {
      rechnungen: "Rechnungen/{YYYY}/{MM}",
      angebote: "Angebote/{YYYY}/{MM}",
      dokumente: "Dokumente/{YYYY}/{MM}",
      protokollUebergabe: "Protokolle/Übergabe-Abnahme/{YYYY}/{MM}",
      protokollSchluessel: "Protokolle/Schlüsselübergabe/{YYYY}/{MM}",
    },
    dateinameSchema: {
      rechnung: "{nummer} {kunde} {leistung} {MM}-{YYYY}",
      angebot: "{nummer} {kunde} {leistung} {MM}-{YYYY}",
      protokoll: "{nummer} {kunde} {leistung} {DD}-{MM}-{YYYY}",
    },
    autoUpload: true,
  }) as GoogleDriveSettings;
  const status = getSetting<{
    kontoEmail?: string; rootOrdnerId?: string;
    letzteSynchronisation?: string; letzterFehler?: string;
  }>("googleDrive.status") ?? {};
  return {
    ...base,
    clientSecretIsSet: !!readSecret(SENSITIVE_KEYS.googleClientSecret),
    refreshTokenIsSet: !!readSecret(SENSITIVE_KEYS.googleRefreshToken),
    ...status,
  };
}

function isSafeRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname);
  } catch {
    return false;
  }
}

export function getGoogleOAuthRedirectUri(req?: { protocol?: string; hostname?: string }): string {
  const fromCfg = process.env.GOOGLE_OAUTH_REDIRECT?.trim();
  if (fromCfg && isSafeRedirectUri(fromCfg)) return fromCfg;
  // WICHTIG: redirect_uri ist IMMER localhost.
  // Google OAuth erlaubt bei http:// nur localhost/127.0.0.1 — keine .local-Hosts
  // oder LAN-IPs. Daher pinnen wir fest auf localhost, unabhängig davon, wie das
  // Backend gerade aufgerufen wird (SSH-Tunnel, .local, LAN-IP). Der einmalige
  // OAuth-Verbinden-Flow läuft dadurch über localhost auf dem Pi; das Token wird
  // serverseitig gespeichert und gilt anschließend für alle Geräte im LAN.
  void req;
  return `http://localhost:${config.port}/einstellungen/google-drive/callback`;
}

export function buildOAuthClient(redirectUri?: string): OAuth2Client {
  const settings = getSetting<GoogleDriveSettings>("googleDrive");
  const clientId = settings?.clientId;
  const clientSecret = readSecret(SENSITIVE_KEYS.googleClientSecret);
  if (!clientId || !clientSecret) throw new Error("Google Drive Client-ID/Secret fehlen");
  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri ?? getGoogleOAuthRedirectUri());
  const refresh = readSecret(SENSITIVE_KEYS.googleRefreshToken);
  if (refresh) client.setCredentials({ refresh_token: refresh });
  return client;
}

// HMAC-State-Token: payload.timestamp ist Unix-Sek; gültig 10 min.
let _stateSecretCache: Buffer | null = null;
function stateSecret(): Buffer {
  if (_stateSecretCache) return _stateSecretCache;
  _stateSecretCache = readFileSync(config.keyPath);
  return _stateSecretCache;
}
export function createState(): string {
  const ts = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(8).toString("hex");
  const payload = `${ts}.${nonce}`;
  const sig = crypto.createHmac("sha256", stateSecret()).update(payload).digest("hex").slice(0, 32);
  return `${payload}.${sig}`;
}
export function verifyState(token: string, maxAgeSec = 600): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [tsStr, nonce, sig] = parts;
  const expected = crypto.createHmac("sha256", stateSecret()).update(`${tsStr}.${nonce}`).digest("hex").slice(0, 32);
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const age = Math.floor(Date.now() / 1000) - Number(tsStr);
  return age >= 0 && age <= maxAgeSec;
}

export function buildAuthUrl(req?: { protocol?: string; hostname?: string }): { url: string; state: string } {
  const state = createState();
  const client = buildOAuthClient(getGoogleOAuthRedirectUri(req));
  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
    include_granted_scopes: true,
  });
  return { url, state };
}

export async function exchangeCode(code: string, req?: { protocol?: string; hostname?: string }): Promise<{ kontoEmail?: string }> {
  const client = buildOAuthClient(getGoogleOAuthRedirectUri(req));
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new Error("Kein refresh_token erhalten — bitte in Google-Konto-Berechtigungen alten Zugriff entfernen und erneut verbinden.");
  setSetting(SENSITIVE_KEYS.googleRefreshToken, tokens.refresh_token, { encrypt: true });

  // Konto-Email holen (optional)
  let kontoEmail: string | undefined;
  try {
    client.setCredentials({ refresh_token: tokens.refresh_token, access_token: tokens.access_token });
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const me = await oauth2.userinfo.get();
    kontoEmail = me.data.email ?? undefined;
  } catch { /* ignore */ }

  const status = getSetting<Record<string, unknown>>("googleDrive.status") ?? {};
  setSetting("googleDrive.status", { ...status, kontoEmail, letzterFehler: undefined });
  return { kontoEmail };
}

export function disconnect(): void {
  deleteSetting(SENSITIVE_KEYS.googleRefreshToken);
  deleteSetting("googleDrive.folderCache");
  const status = getSetting<Record<string, unknown>>("googleDrive.status") ?? {};
  setSetting("googleDrive.status", { ...status, kontoEmail: undefined, rootOrdnerId: undefined, letzteSynchronisation: undefined, letzterFehler: undefined });
}

export function setStatusError(msg: string): void {
  const status = getSetting<Record<string, unknown>>("googleDrive.status") ?? {};
  setSetting("googleDrive.status", { ...status, letzterFehler: msg.slice(0, 500) });
}

export function setStatusOk(rootOrdnerId?: string): void {
  const status = getSetting<Record<string, unknown>>("googleDrive.status") ?? {};
  setSetting("googleDrive.status", {
    ...status,
    rootOrdnerId: rootOrdnerId ?? status.rootOrdnerId,
    letzteSynchronisation: new Date().toISOString(),
    letzterFehler: undefined,
  });
}
