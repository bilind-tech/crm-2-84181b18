// /backup/* — alle authentifiziert. Restore zusätzlich passwort-bestätigt.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as tar from "tar";
import { config } from "../config.js";
import { requireAuth } from "../auth/middleware.js";
import { audit } from "../auth/audit.js";
import { getDatabase } from "../db/index.js";
import { verifyPassword } from "../auth/password.js";
import { createBackup } from "../backup/create.js";
import { restoreFromArchive } from "../backup/restore.js";
import { applyScheduler } from "../backup/scheduler.js";
import {
  deleteRow,
  getById,
  listInProgress,
  listVisible,
  reapZombies,
} from "../backup/repo.js";
import { categoryDir } from "../backup/paths.js";
import {
  getBackupProgress,
  getRestoreProgress,
  listBackupProgress,
} from "../backup/progress.js";
import { getMaintenanceInfo } from "../backup/maintenance.js";
import { parseManifest } from "../backup/manifest.js";

const UPLOAD_LIMIT_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
}

async function passwordOk(userId: string, plain: string): Promise<boolean> {
  const row = getDatabase()
    .prepare(`SELECT id, username, password_hash FROM app_user WHERE id = ?`)
    .get(userId) as UserRow | undefined;
  if (!row) return false;
  return verifyPassword(row.password_hash, plain);
}

function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true, mode: 0o700 });
}

export async function backupRoutes(app: FastifyInstance): Promise<void> {
  // Beim ersten Boot Geister beerdigen
  reapZombies();

  // /backup/restore-status muss AUCH im Wartungsmodus erreichbar sein UND
  // auth-frei, damit das Frontend pollen kann während der Restore läuft.
  app.get("/backup/restore-status", async () => {
    const r = getRestoreProgress();
    const m = getMaintenanceInfo();
    return { restore: r, maintenance: m };
  });

  // /backup/health darf vom Frontend ohne Auth nicht abgefragt werden — bleibt im scoped-Bereich.

  // Alle anderen Routen: auth pflicht.
  app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);

    // Health: letztes erfolgreiches Backup, Alter in Stunden, Warn-Flag
    scoped.get("/backup/health", async () => {
      const rows = listVisible();
      const last = rows[0];
      if (!last) {
        return { letztesErfolgreichesBackup: null, alterStunden: null, warn: true };
      }
      const t = new Date(last.completedAt ?? last.startedAt).getTime();
      const stunden = Math.floor((Date.now() - t) / 3600_000);
      return {
        letztesErfolgreichesBackup: last.completedAt ?? last.startedAt,
        alterStunden: stunden,
        warn: stunden > 36,
        kategorie: last.category,
        dateiname: last.filename,
      };
    });

    scoped.get("/backup/historie", async () => {
      return listVisible().map((r) => ({
        id: r.id,
        zeitpunkt: r.startedAt,
        zeitpunktStart: r.startedAt,
        abgeschlossenAm: r.completedAt,
        kategorie: mapCatToFrontend(r.category),
        ausloeser: mapTriggerToFrontend(r.trigger),
        groesseBytes: r.sizeBytes,
        status: "erfolg" as const,
        dateiname: r.filename,
        sha256: r.sha256,
        appVersion: r.appVersion,
        schemaVersion: r.schemaVersion,
        driveStatus: r.driveStatus === "skip" ? undefined : r.driveStatus,
        driveSyncedAt: r.driveSyncedAt,
        driveError: r.driveError,
      }));
    });

    scoped.get("/backup/in-arbeit", async () => {
      const dbProgress = listInProgress();
      const memProgress = listBackupProgress();
      return dbProgress.map((r) => {
        const live = memProgress.find((p) => p.id === r.id);
        return {
          id: r.id,
          zeitpunkt: r.startedAt,
          zeitpunktStart: r.startedAt,
          abgeschlossenAm: null,
          kategorie: mapCatToFrontend(r.category),
          ausloeser: mapTriggerToFrontend(r.trigger),
          groesseBytes: r.sizeBytes,
          status: "in_arbeit" as const,
          dateiname: r.filename,
          phase: live?.phase ?? "queued",
          percent: live?.percent ?? 0,
          message: live?.message,
        };
      });
    });

    scoped.post("/backup/erstellen", async (req, reply) => {
      // Sofort antworten, im Hintergrund laufen lassen
      void createBackup({ category: "manual", trigger: "manual" }).catch(() => {
        /* Status steht in DB+progress */
      });
      audit({ userId: req.user?.id, action: "backup.create.start", ip: req.ip });
      reply.status(202);
      return { ok: true };
    });

    scoped.get<{ Params: { id: string } }>("/backup/:id/download", async (req, reply) => {
      const id = z.string().min(1).safeParse(req.params.id);
      if (!id.success) {
        reply.status(422);
        return { error: "validation" };
      }
      const row = getById(id.data);
      if (!row || row.status !== "success") {
        reply.status(404);
        return { error: "not-found" };
      }
      const full = path.join(categoryDir(row.category), row.filename);
      if (!existsSync(full)) {
        reply.status(410);
        return { error: "file-gone" };
      }
      audit({ userId: req.user?.id, action: "backup.download", detail: { id: row.id }, ip: req.ip });
      reply.header("Content-Type", "application/gzip");
      reply.header("Content-Length", String(statSync(full).size));
      reply.header("Content-Disposition", `attachment; filename="${row.filename}"`);
      return reply.send(createReadStream(full));
    });

    scoped.post("/backup/upload", {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    }, async (req, reply) => {
      const data = await req.file({ limits: { fileSize: UPLOAD_LIMIT_BYTES } });
      if (!data) {
        reply.status(400);
        return { error: "no-file" };
      }
      const uploadId = crypto.randomUUID();
      ensureDir(config.backupsTmpDir);
      const tmpFile = path.join(config.backupsTmpDir, `upload-${uploadId}.tar.gz`);
      await new Promise<void>((resolve, reject) => {
        const ws = data.file.pipe(createWriteStream(tmpFile, { mode: 0o600 }));
        ws.on("finish", () => resolve());
        ws.on("error", reject);
      });

      // Validierung: Magic-Bytes (gzip 1f 8b) + tar-listing
      try {
        const buf = readFileSync(tmpFile, { encoding: null }).subarray(0, 2);
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) {
          unlinkSync(tmpFile);
          reply.status(415);
          return { error: "kein gzip" };
        }
      } catch {
        reply.status(500);
        return { error: "io" };
      }

      // Manifest aus tar extrahieren (in-memory, ohne ganzes Archiv auszupacken)
      let manifestRaw: unknown = null;
      try {
        await new Promise<void>((resolve, reject) => {
          const chunks: Buffer[] = [];
          let found = false;
          tar.list({
            file: tmpFile,
            filter: (p) => p === "manifest.json" || p === "./manifest.json",
            onReadEntry: (entry) => {
              found = true;
              entry.on("data", (c: Buffer) => chunks.push(c));
              entry.on("end", () => {
                try {
                  manifestRaw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                } catch {
                  manifestRaw = null;
                }
              });
            },
          }).then(
            () => {
              if (!found) reject(new Error("manifest.json fehlt"));
              else resolve();
            },
            (e) => reject(e),
          );
        });
      } catch (e) {
        try { unlinkSync(tmpFile); } catch { /* ignore */ }
        reply.status(415);
        return { error: "kein gültiges tar.gz", detail: String(e) };
      }

      const m = parseManifest(manifestRaw);
      if (!m.ok) {
        try { unlinkSync(tmpFile); } catch { /* ignore */ }
        reply.status(415);
        return { error: "ungültiges Manifest: " + m.error };
      }

      const sizeBytes = statSync(tmpFile).size;

      // SHA256 der hochgeladenen Datei berechnen — Frontend zeigt das im Restore-Dialog
      const archiveSha = await new Promise<string>((resolve, reject) => {
        const h = crypto.createHash("sha256");
        const s = createReadStream(tmpFile);
        s.on("data", (c) => h.update(c));
        s.on("end", () => resolve(h.digest("hex")));
        s.on("error", reject);
      });

      audit({ userId: req.user?.id, action: "backup.upload", detail: { uploadId, sizeBytes, sha256: archiveSha }, ip: req.ip });

      return {
        uploadId,
        fileName: data.filename ?? `upload-${uploadId}.tar.gz`,
        sizeBytes,
        sha256: archiveSha,
        version: m.manifest.appVersion,
        schemaVersion: m.manifest.schemaVersion,
        vermutetesDatum: m.manifest.createdAt,
        // Frontend nutzt das, um einen gelben Versions-Mismatch-Hinweis zu zeigen
        versionMismatch: m.manifest.appVersion !== config.version
          ? { backupVersion: m.manifest.appVersion, systemVersion: config.version }
          : null,
      };
    });

    scoped.post<{ Params: { id: string }; Body: { passwort?: string } }>(
      "/backup/:id/restore",
      { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
      async (req, reply) => {
        const params = z.object({ id: z.string().min(1) }).safeParse(req.params);
        if (!params.success) {
          reply.status(422);
          return { error: "validation" };
        }
        const row = getById(params.data.id);
        if (!row || row.status !== "success") {
          reply.status(404);
          return { error: "not-found" };
        }
        const full = path.join(categoryDir(row.category), row.filename);
        if (!existsSync(full)) {
          reply.status(410);
          return { error: "file-gone" };
        }

        // Passwort-Re-Auth zwingend
        const pwOk = req.user && typeof req.body?.passwort === "string"
          ? await passwordOk(req.user.id, req.body.passwort)
          : false;
        if (!pwOk) {
          reply.status(401);
          return { error: "passwort" };
        }

        audit({ userId: req.user?.id, action: "restore.start", detail: { id: row.id }, ip: req.ip });

        // Im Hintergrund starten — sofort 202
        void restoreFromArchive({ archivePath: full, triggeredBy: req.user?.id ?? null });
        reply.status(202);
        return { ok: true };
      },
    );

    scoped.post<{ Params: { uploadId: string }; Body: { passwort?: string } }>(
      "/backup/upload/:uploadId/restore",
      { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
      async (req, reply) => {
        const params = z.object({ uploadId: z.string().min(1) }).safeParse(req.params);
        if (!params.success) {
          reply.status(422);
          return { error: "validation" };
        }
        const tmpFile = path.join(config.backupsTmpDir, `upload-${params.data.uploadId}.tar.gz`);
        if (!existsSync(tmpFile)) {
          reply.status(404);
          return { error: "upload-not-found" };
        }
        const pwOk = req.user && typeof req.body?.passwort === "string"
          ? await passwordOk(req.user.id, req.body.passwort)
          : false;
        if (!pwOk) {
          reply.status(401);
          return { error: "passwort" };
        }

        audit({ userId: req.user?.id, action: "restore.upload.start", detail: { uploadId: params.data.uploadId }, ip: req.ip });
        void restoreFromArchive({ archivePath: tmpFile, triggeredBy: req.user?.id ?? null }).then(() => {
          // Upload-Datei nach erfolgreichem Verbrauch entfernen
          try { unlinkSync(tmpFile); } catch { /* ignore */ }
        });
        reply.status(202);
        return { ok: true };
      },
    );

    scoped.delete<{ Params: { id: string } }>("/backup/:id", async (req, reply) => {
      const params = z.object({ id: z.string().min(1) }).safeParse(req.params);
      if (!params.success) {
        reply.status(422);
        return { error: "validation" };
      }
      const row = getById(params.data.id);
      if (!row) {
        reply.status(404);
        return { error: "not-found" };
      }
      // Nur manuelle und Sicherheits-Backups dürfen explizit gelöscht werden
      if (row.category === "daily" || row.category === "weekly" || row.category === "monthly") {
        reply.status(409);
        return { error: "geplante Backups löscht nur die Rotation" };
      }
      try {
        const full = path.join(categoryDir(row.category), row.filename);
        if (existsSync(full)) unlinkSync(full);
      } catch {
        /* best effort */
      }
      deleteRow(row.id);
      audit({ userId: req.user?.id, action: "backup.delete", detail: { id: row.id }, ip: req.ip });
      return { ok: true };
    });
  });

  // Hook für PATCH /einstellungen/backup → Scheduler neu armen
  app.addHook("onResponse", async (req) => {
    if (req.method === "PATCH" && req.url.startsWith("/einstellungen/backup")) {
      try {
        applyScheduler();
      } catch {
        /* ignore */
      }
    }
  });
}

function mapCatToFrontend(c: string): string {
  return c; // Frontend nutzt dieselben Werte
}
function mapTriggerToFrontend(t: string): string {
  if (t === "pre-restore") return "vor-restore";
  if (t === "pre-update") return "vor-update";
  return t; // auto, manual
}
