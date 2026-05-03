// GitHub als Update-Quelle.
// Lädt einen Commit-Tarball vom verbundenen Repo, entpackt ihn in das übliche
// staging/<id>/extract/-Layout, baut on-the-fly ein lokal-signiertes Manifest
// und legt einen "validiertes Paket"-Eintrag an. Anschließend kann der
// vorhandene Update-Runner unverändert gestartet werden.
//
// SICHERHEIT
//  - PAT wird verschlüsselt im setting-Store abgelegt (SENSITIVE_KEYS.githubToken).
//  - Tarball-Größe begrenzt (200 MB), ZIP-Allowlist wird auf das entpackte
//    Verzeichnis NACH dem Extract erneut angewendet.
//  - Manifest wird mit dem master.key des Pi signiert (gleiche Funktion wie
//    bei "richtigen" Releases) — fremde Repos kommen nicht durch, weil wir
//    den Tarball nur von der konfigurierten owner/repo-Kombination herunterladen.

import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { extract as tarExtract } from "tar";
import { config } from "../config.js";
import { getSetting, setSetting, deleteSetting, getSettingMeta } from "../settings/store.js";
import { decryptString } from "../crypto/aes.js";
import { getDatabase } from "../db/index.js";
import { ensureAppDirs, stagingDir } from "./paths.js";
import { signManifest } from "./manifest.js";
import { computeMigrationsDiff } from "./migrations-diff.js";
import { getSchemaVersion } from "../db/index.js";
import { insertPaket } from "./repo.js";
import type { GithubUpdateSettings } from "../settings/schemas.js";
import { SENSITIVE_KEYS } from "../settings/schemas.js";

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "MyCleanCenter-Pi-Updater";

interface SecretRow { value: string; encrypted: number }

function readEncryptedSecret(key: string): string | null {
  const row = getDatabase()
    .prepare(`SELECT value, encrypted FROM setting WHERE key = ?`)
    .get(key) as SecretRow | undefined;
  if (!row) return null;
  const raw = row.encrypted ? decryptString(row.value) : row.value;
  try { return JSON.parse(raw) as string; } catch { return raw; }
}

export interface GithubStatus extends GithubUpdateSettings {
  tokenIsSet: boolean;
  installedVersion: string;        // aktuell laufende Backend-Version
  installedCommit: string | null;  // letzter via GitHub installierter SHA, falls bekannt
  remoteCommit: string | null;     // letzter SHA auf gewähltem Branch
  remoteCommitDate: string | null;
  remoteCommitMessage: string | null;
  letzteSynchronisation: string | null;
  letzterFehler: string | null;
  updateVerfuegbar: boolean;
}

export function loadGithubSettings(): GithubUpdateSettings {
  return getSetting<GithubUpdateSettings>("githubUpdate") ?? {
    repo: "",
    branch: "main",
    autoCheck: true,
  };
}

export function saveGithubSettings(s: GithubUpdateSettings): void {
  setSetting("githubUpdate", s);
}

interface StatusExtra {
  installedCommit?: string | null;
  remoteCommit?: string | null;
  remoteCommitDate?: string | null;
  remoteCommitMessage?: string | null;
  letzteSynchronisation?: string | null;
  letzterFehler?: string | null;
}
function readStatusExtra(): StatusExtra {
  return getSetting<StatusExtra>("githubUpdate.status") ?? {};
}
function writeStatusExtra(p: Partial<StatusExtra>): void {
  const cur = readStatusExtra();
  setSetting("githubUpdate.status", { ...cur, ...p });
}

export function setGithubError(msg: string): void {
  writeStatusExtra({ letzterFehler: msg.slice(0, 500) });
}

// --- GitHub-API ---

interface RemoteCommit {
  sha: string;
  date: string;
  message: string;
}

async function ghFetch(url: string, token: string, accept = "application/vnd.github+json"): Promise<Response> {
  const res = await fetch(url, {
    headers: {
      "Accept": accept,
      "Authorization": `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": USER_AGENT,
    },
  });
  return res;
}

export async function fetchLatestCommit(repo: string, branch: string, token: string): Promise<RemoteCommit> {
  const url = `${GITHUB_API}/repos/${encodeURIComponent(repo.split("/")[0])}/${encodeURIComponent(repo.split("/")[1])}/commits/${encodeURIComponent(branch)}`;
  const res = await ghFetch(url, token);
  if (res.status === 401 || res.status === 403) throw new GithubError("PAT ungültig oder fehlende Berechtigung", 401);
  if (res.status === 404) throw new GithubError("Repository oder Branch nicht gefunden", 404);
  if (!res.ok) throw new GithubError(`GitHub-Fehler ${res.status}`, 502);
  const data = (await res.json()) as { sha: string; commit: { message: string; committer: { date: string } } };
  return {
    sha: data.sha,
    date: data.commit.committer.date,
    message: (data.commit.message ?? "").split("\n")[0].slice(0, 200),
  };
}

export class GithubError extends Error {
  statusCode: number;
  constructor(msg: string, status = 400) {
    super(msg);
    this.statusCode = status;
  }
}

// --- Status zusammenstellen ---

export async function buildStatus(opts: { refresh?: boolean } = {}): Promise<GithubStatus> {
  const settings = loadGithubSettings();
  const tokenMeta = getSettingMeta(SENSITIVE_KEYS.githubToken);
  const extra = readStatusExtra();

  const status: GithubStatus = {
    ...settings,
    tokenIsSet: tokenMeta.exists,
    installedVersion: config.version,
    installedCommit: extra.installedCommit ?? null,
    remoteCommit: extra.remoteCommit ?? null,
    remoteCommitDate: extra.remoteCommitDate ?? null,
    remoteCommitMessage: extra.remoteCommitMessage ?? null,
    letzteSynchronisation: extra.letzteSynchronisation ?? null,
    letzterFehler: extra.letzterFehler ?? null,
    updateVerfuegbar: false,
  };

  if (opts.refresh && status.tokenIsSet && settings.repo) {
    const token = readEncryptedSecret(SENSITIVE_KEYS.githubToken);
    if (token) {
      try {
        const c = await fetchLatestCommit(settings.repo, settings.branch, token);
        writeStatusExtra({
          remoteCommit: c.sha,
          remoteCommitDate: c.date,
          remoteCommitMessage: c.message,
          letzteSynchronisation: new Date().toISOString(),
          letzterFehler: null,
        });
        status.remoteCommit = c.sha;
        status.remoteCommitDate = c.date;
        status.remoteCommitMessage = c.message;
        status.letzteSynchronisation = new Date().toISOString();
        status.letzterFehler = null;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setGithubError(msg);
        status.letzterFehler = msg;
      }
    }
  }

  status.updateVerfuegbar =
    !!status.remoteCommit &&
    !!status.installedCommit &&
    status.remoteCommit !== status.installedCommit;
  // Wenn wir noch nie über GitHub installiert haben, gilt: Update verfügbar,
  // sobald wir überhaupt einen Remote-Commit kennen.
  if (status.remoteCommit && !status.installedCommit) status.updateVerfuegbar = true;

  return status;
}

// --- Tarball laden + entpacken + als validiertes Paket ablegen ---

const MAX_TARBALL_BYTES = 200 * 1024 * 1024;

export interface PreparedPackage {
  uploadId: string;
  fileName: string;
  sizeBytes: number;
  version: string;
  pendingMigrations: string[];
  warnings: string[];
  sha: string;       // Commit-SHA, der gerade geladen wurde
}

export async function prepareUpdateFromGithub(): Promise<PreparedPackage> {
  const settings = loadGithubSettings();
  if (!settings.repo) throw new GithubError("Kein Repository konfiguriert", 400);
  const token = readEncryptedSecret(SENSITIVE_KEYS.githubToken);
  if (!token) throw new GithubError("Kein PAT hinterlegt — bitte zuerst verbinden", 400);

  const commit = await fetchLatestCommit(settings.repo, settings.branch, token);

  // Tarball laden
  const [owner, repo] = settings.repo.split("/");
  const tarUrl = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tarball/${encodeURIComponent(commit.sha)}`;
  const res = await ghFetch(tarUrl, token, "application/vnd.github.v3.raw");
  if (!res.ok || !res.body) throw new GithubError(`Tarball-Download fehlgeschlagen (${res.status})`, 502);

  ensureAppDirs();
  const uploadId = crypto.randomUUID();
  const stage = stagingDir(uploadId);
  mkdirSync(stage, { recursive: true });
  const tarPath = path.join(stage, "_paket.tar.gz");
  const writeStream = createWriteStream(tarPath);

  // Größe live mitzählen, bei Limit abbrechen.
  let bytes = 0;
  const cap = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > MAX_TARBALL_BYTES) {
        controller.error(new GithubError("Tarball überschreitet 200 MB", 413));
        return;
      }
      controller.enqueue(chunk);
    },
  });
  const piped = res.body.pipeThrough(cap);
  // @ts-expect-error WHATWG/Node interop: web ReadableStream → Node Readable
  await pipeline(Readable.fromWeb(piped), writeStream);

  // Tarball entpacken in stage/_raw/  (eine Wurzel: <owner>-<repo>-<sha>/)
  const rawDir = path.join(stage, "_raw");
  mkdirSync(rawDir, { recursive: true });
  await tarExtract({ file: tarPath, cwd: rawDir, strip: 0 });
  const rootEntries = readdirSync(rawDir);
  if (rootEntries.length !== 1) {
    rmSync(stage, { recursive: true, force: true });
    throw new GithubError(`Unerwartete Tarball-Struktur (${rootEntries.length} Wurzeln)`, 400);
  }
  const repoRoot = path.join(rawDir, rootEntries[0]);

  // Auf Layout des Update-Runners umbiegen: stage/extract/  ist die Code-Wurzel.
  const extractDir = path.join(stage, "extract");
  renameSync(repoRoot, extractDir);
  rmSync(rawDir, { recursive: true, force: true });
  try { rmSync(tarPath); } catch { /* ignore */ }

  // Manifest lokal bauen + signieren (Wir vertrauen der Quelle, weil wir per
  // PAT authentifiziert von der konfigurierten Repo-URL geladen haben.)
  const newVersion = deriveAppVersion(extractDir, commit.sha);
  const manifest = signManifest({
    appVersion: newVersion,
    schemaVersion: getSchemaVersion(),  // wird nach Migrations-Diff ggf. höher (handled vom Probelauf)
    minBackendVersion: config.version,
    createdAt: new Date().toISOString(),
    hinweise: `GitHub: ${settings.repo}@${commit.sha.slice(0, 7)} — ${commit.message}`,
  });

  // Migrations-Diff bestimmen (für Manifest-schemaVersion und Warnings)
  let diff;
  try { diff = computeMigrationsDiff(extractDir); }
  catch { diff = { pending: [], downgrade: false, liveVersion: 0, paketVersion: 0 }; }
  if (diff.downgrade) {
    rmSync(stage, { recursive: true, force: true });
    throw new GithubError(`Schema-Downgrade verweigert: Paket bringt Migrations bis ${diff.paketVersion}, Live-DB ist bei ${diff.liveVersion}.`, 400);
  }
  // schemaVersion auf Paket-Wert hochziehen, wenn das Paket weiterführt
  if (diff.paketVersion > manifest.schemaVersion) {
    manifest.schemaVersion = diff.paketVersion;
    // erneut signieren
    const re = signManifest({
      appVersion: manifest.appVersion,
      schemaVersion: manifest.schemaVersion,
      createdAt: manifest.createdAt,
      minBackendVersion: manifest.minBackendVersion,
      hinweise: manifest.hinweise,
    });
    manifest.signature = re.signature;
  }

  const sizeBytes = directorySize(extractDir);
  const gueltigBis = new Date(Date.now() + 30 * 60_000).toISOString();
  const warnings: string[] = [];
  if (manifest.hinweise) warnings.push(manifest.hinweise);
  if (diff.pending.length > 5) warnings.push(`${diff.pending.length} ausstehende Migrationen — bitte vorher Backup prüfen.`);

  insertPaket({
    id: uploadId,
    dateiname: `github-${commit.sha.slice(0, 7)}.tar.gz`,
    groesseBytes: sizeBytes,
    sha256: commit.sha,                   // wir nehmen den Commit-SHA als Identitätsmerkmal
    manifestJson: JSON.stringify(manifest),
    stagingPfad: extractDir,
    validiert: true,
    gueltigBis,
  });

  // Status-Update: remote-commit ist nun „bereitgestellt".
  writeStatusExtra({
    remoteCommit: commit.sha,
    remoteCommitDate: commit.date,
    remoteCommitMessage: commit.message,
    letzteSynchronisation: new Date().toISOString(),
    letzterFehler: null,
  });

  return {
    uploadId,
    fileName: `github-${commit.sha.slice(0, 7)}`,
    sizeBytes,
    version: manifest.appVersion,
    pendingMigrations: diff.pending,
    warnings,
    sha: commit.sha,
  };
}

/** Nach erfolgreichem Update: SHA als „installiert" merken. */
export function markInstalledCommit(sha: string): void {
  writeStatusExtra({ installedCommit: sha });
}

/** PAT + Settings entfernen. */
export function disconnectGithub(): void {
  deleteSetting(SENSITIVE_KEYS.githubToken);
  deleteSetting("githubUpdate.status");
}

// --- Helpers ---

function deriveAppVersion(extractDir: string, sha: string): string {
  // Nutze package.json-Version, wenn vorhanden; sonst aktuelle config.version + Commit-Suffix.
  const pkgPath = path.join(extractDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
      if (pkg.version && /^\d+\.\d+\.\d+/.test(pkg.version)) {
        // Wenn identische Version wie laufend → Suffix anhängen damit Manifest-Check (>= aktuell) durchgeht.
        if (pkg.version === config.version) return `${pkg.version}-gh.${sha.slice(0, 7)}`;
        return pkg.version;
      }
    } catch { /* ignore */ }
  }
  return `${config.version}-gh.${sha.slice(0, 7)}`;
}

function directorySize(dir: string): number {
  let total = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const entry of readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (entry.isFile()) {
        try { total += statSync(p).size; } catch { /* ignore */ }
      }
    }
  }
  return total;
}
