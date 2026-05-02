// Drive-Folders: Root + monatliche Unterordner mit Cache.
// Cache liegt im Setting `googleDrive.folderCache` als JSON: { rootId, "Rechnungen/2026/05": id, ... }
import { google, type drive_v3 } from "googleapis";
import { buildOAuthClient } from "./oauth.js";
import { getSetting, setSetting } from "../settings/store.js";
import type { GoogleDriveSettings } from "../settings/schemas.js";

const FOLDER_MIME = "application/vnd.google-apps.folder";

interface Cache { rootId?: string; subs: Record<string, string> }
function loadCache(): Cache {
  return (getSetting<Cache>("googleDrive.folderCache") ?? { subs: {} }) as Cache;
}
function saveCache(c: Cache): void { setSetting("googleDrive.folderCache", c); }

let _client: drive_v3.Drive | null = null;
let _clientKey = "";

function getClient(): drive_v3.Drive {
  // Nur neu bauen wenn sich Settings geändert haben
  const settings = getSetting<GoogleDriveSettings>("googleDrive");
  const key = JSON.stringify({ clientId: settings?.clientId, root: settings?.rootFolderName });
  if (_client && _clientKey === key) return _client;
  _client = google.drive({ version: "v3", auth: buildOAuthClient() });
  _clientKey = key;
  return _client;
}
export function resetDriveClient(): void { _client = null; }

async function findOrCreateFolder(name: string, parentId?: string): Promise<string> {
  const drive = getClient();
  const q = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    `mimeType = '${FOLDER_MIME}'`,
    "trashed = false",
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(" and ");
  const found = await drive.files.list({ q, fields: "files(id,name)", pageSize: 1 });
  if (found.data.files && found.data.files[0]?.id) return found.data.files[0].id;
  const created = await drive.files.create({
    requestBody: {
      name, mimeType: FOLDER_MIME,
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });
  if (!created.data.id) throw new Error("Drive-Ordner konnte nicht erstellt werden");
  return created.data.id;
}

export async function ensureRootFolder(): Promise<string> {
  const cache = loadCache();
  if (cache.rootId) return cache.rootId;
  const settings = getSetting<GoogleDriveSettings>("googleDrive");
  const name = settings?.rootFolderName || "mycleancenter.cm";
  const id = await findOrCreateFolder(name);
  cache.rootId = id;
  saveCache(cache);
  return id;
}

export async function ensureMonthFolder(art: "angebot" | "rechnung", jahr: number, monat: number): Promise<string> {
  const top = art === "angebot" ? "Angebote" : "Rechnungen";
  const mm = String(monat).padStart(2, "0");
  const path = `${top}/${jahr}/${mm}`;
  const cache = loadCache();
  if (cache.subs[path]) return cache.subs[path];

  const root = await ensureRootFolder();
  const topId = cache.subs[top] ?? await findOrCreateFolder(top, root);
  cache.subs[top] = topId;
  const yearId = cache.subs[`${top}/${jahr}`] ?? await findOrCreateFolder(String(jahr), topId);
  cache.subs[`${top}/${jahr}`] = yearId;
  const monthId = await findOrCreateFolder(mm, yearId);
  cache.subs[path] = monthId;
  saveCache(cache);
  return monthId;
}

export async function uploadFile(opts: {
  parentFolderId: string;
  name: string;
  data: Buffer;
  mimeType?: string;
}): Promise<{ id: string; webViewLink?: string }> {
  const drive = getClient();
  const { Readable } = await import("node:stream");
  const res = await drive.files.create({
    requestBody: { name: opts.name, parents: [opts.parentFolderId] },
    media: { mimeType: opts.mimeType ?? "application/pdf", body: Readable.from(opts.data) },
    fields: "id, webViewLink",
  });
  return { id: res.data.id ?? "", webViewLink: res.data.webViewLink ?? undefined };
}

export async function createTextFile(opts: { parentFolderId: string; name: string; content: string }): Promise<{ id: string; webViewLink?: string }> {
  const drive = getClient();
  const { Readable } = await import("node:stream");
  const res = await drive.files.create({
    requestBody: { name: opts.name, parents: [opts.parentFolderId] },
    media: { mimeType: "text/plain", body: Readable.from(Buffer.from(opts.content, "utf8")) },
    fields: "id, webViewLink",
  });
  return { id: res.data.id ?? "", webViewLink: res.data.webViewLink ?? undefined };
}
