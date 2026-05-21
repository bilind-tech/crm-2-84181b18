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
  return ensureFolderPath(`${top}/${jahr}/${mm}`);
}

/** Erstellt rekursiv die Ordnerkette unter dem Root. Pfad wie "Rechnungen/2026/05". */
export async function ensureFolderPath(relPath: string): Promise<string> {
  const segments = relPath.split("/").map((s) => s.trim()).filter((s) => s.length > 0);
  if (segments.length === 0) return ensureRootFolder();
  const cache = loadCache();
  const root = await ensureRootFolder();
  let parentId = root;
  let acc = "";
  for (const seg of segments) {
    acc = acc ? `${acc}/${seg}` : seg;
    const cached = cache.subs[acc];
    if (cached) {
      parentId = cached;
      continue;
    }
    const id = await findOrCreateFolder(seg, parentId);
    cache.subs[acc] = id;
    parentId = id;
  }
  saveCache(cache);
  return parentId;
}

export async function uploadFile(opts: {
  parentFolderId: string;
  name: string;
  data: Buffer;
  mimeType?: string;
  /** Wenn gesetzt, wird der Datei-Inhalt dieser bestehenden Drive-Datei überschrieben
   *  (gleiche fileId + webViewLink bleiben erhalten). */
  replaceFileId?: string;
}): Promise<{ id: string; webViewLink?: string }> {
  const drive = getClient();
  const { Readable } = await import("node:stream");
  if (opts.replaceFileId) {
    try {
      const updated = await drive.files.update({
        fileId: opts.replaceFileId,
        media: { mimeType: opts.mimeType ?? "application/pdf", body: Readable.from(opts.data) },
        fields: "id, webViewLink",
      });
      return { id: updated.data.id ?? opts.replaceFileId, webViewLink: updated.data.webViewLink ?? undefined };
    } catch (e) {
      // Datei existiert evtl. nicht mehr → Fallback: neu anlegen.
      const msg = e instanceof Error ? e.message : String(e);
      if (!/404|notFound|not found/i.test(msg)) throw e;
    }
  }
  const res = await drive.files.create({
    requestBody: { name: opts.name, parents: [opts.parentFolderId] },
    media: { mimeType: opts.mimeType ?? "application/pdf", body: Readable.from(opts.data) },
    fields: "id, webViewLink",
  });
  return { id: res.data.id ?? "", webViewLink: res.data.webViewLink ?? undefined };
}

/** Stream-Variante für sehr große Dateien (Backups). */
export async function uploadStream(opts: {
  parentFolderId: string;
  name: string;
  stream: NodeJS.ReadableStream;
  mimeType?: string;
}): Promise<{ id: string; webViewLink?: string }> {
  const drive = getClient();
  const res = await drive.files.create({
    requestBody: { name: opts.name, parents: [opts.parentFolderId] },
    media: { mimeType: opts.mimeType ?? "application/gzip", body: opts.stream },
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

// ---------- Dokumente-Mirror: CRM-Ordner ↔ Drive ----------

/** Wurzel-Ordner für die freie Dokumente-Spiegelung (`mycleancenter.cm/Dokumente`). */
export async function ensureDokumenteRoot(): Promise<string> {
  return ensureFolderPath("Dokumente");
}

/** Wurzel-Ordner für den weichen Drive-Papierkorb (`mycleancenter.cm/Dokumente/_Papierkorb`). */
export async function ensurePapierkorbRoot(): Promise<string> {
  return ensureFolderPath("Dokumente/_Papierkorb");
}

/** Legt einen Drive-Ordner mit Namen unter parentId an oder findet einen existierenden. */
export async function ensureNamedFolder(name: string, parentId: string): Promise<string> {
  return findOrCreateFolder(name, parentId);
}

export async function renameDriveFolder(fileId: string, name: string): Promise<void> {
  const drive = getClient();
  await drive.files.update({ fileId, requestBody: { name } });
}

/** Verschiebt eine Drive-Datei/Ordner unter einen neuen Parent. */
export async function moveDriveFile(
  fileId: string,
  neuerParentId: string,
): Promise<void> {
  const drive = getClient();
  const cur = await drive.files.get({ fileId, fields: "parents" });
  const oldParents = (cur.data.parents ?? []).join(",");
  await drive.files.update({
    fileId,
    addParents: neuerParentId,
    removeParents: oldParents || undefined,
    requestBody: {},
  });
}

/** Legt eine Datei in den Drive-Papierkorb (trashed=true, 30 Tage Rettungsnetz). */
export async function trashDriveFile(fileId: string): Promise<void> {
  const drive = getClient();
  await drive.files.update({ fileId, requestBody: { trashed: true } });
}

/** Holt aktuelle Drive-Metadaten — wird für Pre-Flight-Checks vor Löschungen verwendet. */
export async function getDriveFileMeta(fileId: string): Promise<{
  id: string; name: string; parents: string[]; trashed: boolean; mimeType: string;
} | null> {
  try {
    const drive = getClient();
    const res = await drive.files.get({
      fileId,
      fields: "id,name,parents,trashed,mimeType",
    });
    return {
      id: res.data.id ?? fileId,
      name: res.data.name ?? "",
      parents: res.data.parents ?? [],
      trashed: !!res.data.trashed,
      mimeType: res.data.mimeType ?? "",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/404|notFound|not found/i.test(msg)) return null;
    throw e;
  }
}

/** Listet Kinder eines Drive-Ordners (nur ID + Name + Trashed-Flag). */
export async function listDriveChildren(parentId: string): Promise<{
  id: string; name: string; mimeType: string; trashed: boolean;
}[]> {
  const drive = getClient();
  const out: { id: string; name: string; mimeType: string; trashed: boolean }[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${parentId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id,name,mimeType,trashed)",
      pageSize: 500,
      pageToken,
    });
    for (const f of res.data.files ?? []) {
      out.push({
        id: f.id ?? "",
        name: f.name ?? "",
        mimeType: f.mimeType ?? "",
        trashed: !!f.trashed,
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}
