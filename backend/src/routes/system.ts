// REST-Routen für System-Update + Rollback.
// Frontend-Endpoints (siehe src/hooks/useApi.ts):
//   GET  /system/info
//   GET  /system/update/historie
//   POST /system/update/validate           (multipart, file=paket)
//   POST /system/update/install/:uploadId
//   GET  /system/update/lauf/:id
//   GET  /system/update/lauf/aktuell
//   POST /system/update/rollback/:version  (body: { passwort })
import path from "node:path";
import { mkdirSync, createWriteStream, existsSync, rmSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { audit } from "../auth/audit.js";
import { verifyPassword } from "../auth/password.js";
import { getDatabase } from "../db/index.js";
import { config } from "../config.js";
import { ensureAppDirs, stagingDir } from "../system/paths.js";
import { extractManifestOnly, extractZipSafe, sha256File } from "../system/zip.js";
import { ManifestError, validateManifest } from "../system/manifest.js";
import { getSystemInfo } from "../system/info.js";
import {
  getAktuellerLauf,
  getLauf,
  insertPaket,
  isPaketValide,
  listHistorie,
  listInstalledVersions,
} from "../system/repo.js";
import { isUpdateRunning, manualRollback, startInstall, getPreviousVersionStamp } from "../system/runner.js";
import { computeMigrationsDiff } from "../system/migrations-diff.js";
import type { UpdateLauf } from "../system/types.js";

// In-memory Rollback-Lockout: 3 Fehlversuche → 15 min sperren.
const rollbackFails = new Map<string, { count: number; until: number }>();

function adaptLauf(l: UpdateLauf): unknown {
  return {
    id: l.id,
    von: l.vorherigeVersion,
    zu: l.neueVersion,
    startetAm: l.gestartetAm,
    beendetAm: l.beendetAm,
    status: l.status,
    fehlgeschlagenBei: l.steps.find((s) => s.status === "fehler")?.stepId,
    safetyBackupId: l.safetyBackupId,
    quelle: l.quelle,
    steps: l.steps.map((s) => ({
      id: s.stepId,
      label: s.label,
      status: s.status === "wartet" ? "wartet"
            : s.status === "laeuft" ? "laeuft"
            : s.status === "ok" ? "ok"
            : s.status === "fehler" ? "fehler" : "wartet",
      detail: s.detail ?? undefined,
      fehlerGrund: s.fehlerText ?? undefined,
    })),
  };
}

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  // --- GET /system/info ---
  app.get("/system/info", { preHandler: requireAuth }, async () => getSystemInfo());

  // --- GET /system/update/historie ---
  app.get("/system/update/historie", { preHandler: requireAuth }, async () => {
    const db = listInstalledVersions();
    if (db.length > 0) return db;
    // Fallback: aktuelle Version als einziger Eintrag
    return [{
      version: config.version,
      installedAt: new Date().toISOString(),
      istAktiv: true,
      rollbackVerfuegbar: false,
    }];
  });

  // --- POST /system/update/validate ---
  app.post("/system/update/validate", {
    preHandler: requireAuth,
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const file = await req.file({ limits: { fileSize: 200 * 1024 * 1024 } });
    if (!file) return reply.status(400).send({ error: "Kein Paket hochgeladen" });
    if (!file.filename.toLowerCase().endsWith(".zip")) {
      return reply.status(400).send({ error: "Nur ZIP-Pakete erlaubt" });
    }

    ensureAppDirs();
    const uploadId = crypto.randomUUID();
    const stage = stagingDir(uploadId);
    mkdirSync(stage, { recursive: true });
    const zipPath = path.join(stage, "_paket.zip");

    try {
      await pipeline(file.file, createWriteStream(zipPath));
      if (file.file.truncated) {
        rmSync(stage, { recursive: true, force: true });
        return reply.status(413).send({ error: "Paket zu groß (>200 MB)" });
      }

      const manifestRaw = await extractManifestOnly(zipPath);
      let manifest;
      try {
        manifest = validateManifest(JSON.parse(manifestRaw), {
          appVersion: config.version,
          schemaVersion: (await import("../db/index.js")).getSchemaVersion(),
        });
      } catch (e) {
        rmSync(stage, { recursive: true, force: true });
        const msg = e instanceof ManifestError ? e.message : (e as Error).message;
        return reply.status(400).send({
          error: "Manifest ungültig",
          uploadId: null,
          fileName: file.filename,
          sizeBytes: 0,
          version: "",
          pendingMigrations: [],
          warnings: [],
          valide: false,
          fehlerGrund: msg,
        });
      }

      // Komplettes Entpacken in stage/extract/
      const extractDir = path.join(stage, "extract");
      mkdirSync(extractDir, { recursive: true });
      try {
        await extractZipSafe(zipPath, extractDir);
      } catch (e) {
        rmSync(stage, { recursive: true, force: true });
        const status = (e as { statusCode?: number }).statusCode ?? 400;
        return reply.status(status).send({ error: (e as Error).message });
      }

      const sha = await sha256File(zipPath);
      const sizeBytes = file.file.bytesRead;
      const gueltigBis = new Date(Date.now() + 30 * 60_000).toISOString();

      // Echter Migrations-Diff aus dem entpackten Paket
      let diff;
      try {
        diff = computeMigrationsDiff(extractDir);
      } catch {
        diff = { pending: [], downgrade: false, liveVersion: 0, paketVersion: 0 };
      }
      if (diff.downgrade) {
        rmSync(stage, { recursive: true, force: true });
        return reply.status(400).send({
          uploadId: null, fileName: file.filename, sizeBytes: 0, version: manifest.appVersion,
          pendingMigrations: [], warnings: [], valide: false,
          fehlerGrund: `Schema-Downgrade verweigert: Paket bringt Migrations bis ${diff.paketVersion}, Live-DB ist bei ${diff.liveVersion}.`,
        });
      }
      const warnings: string[] = [];
      if (manifest.hinweise) warnings.push(manifest.hinweise);
      if (diff.pending.length > 5) {
        warnings.push(`${diff.pending.length} ausstehende Migrationen — bitte vorher Backup prüfen.`);
      }

      insertPaket({
        id: uploadId,
        dateiname: file.filename,
        groesseBytes: sizeBytes,
        sha256: sha,
        manifestJson: JSON.stringify(manifest),
        stagingPfad: extractDir,
        validiert: true,
        gueltigBis,
      });

      audit({
        userId: req.user!.id,
        ip: req.ip,
        action: "system.update.validiert",
        detail: { uploadId, version: manifest.appVersion, sizeBytes, pendingMigrations: diff.pending.length },
      });

      return {
        uploadId,
        fileName: file.filename,
        sizeBytes,
        version: manifest.appVersion,
        pendingMigrations: diff.pending,
        warnings,
        valide: true,
      };
    } catch (e) {
      rmSync(stage, { recursive: true, force: true });
      throw e;
    }
  });

  // --- POST /system/update/install/:uploadId ---
  app.post<{ Params: { uploadId: string } }>("/system/update/install/:uploadId", {
    preHandler: requireAuth,
  }, async (req, reply) => {
    if (!isPaketValide(req.params.uploadId)) {
      return reply.status(404).send({ error: "Upload-ID unbekannt oder abgelaufen" });
    }
    try {
      const { laufId } = startInstall({ uploadId: req.params.uploadId, userId: req.user!.id });
      audit({ userId: req.user!.id, ip: req.ip, action: "system.update.install_start", detail: { laufId } });
      const lauf = getLauf(laufId);
      return adaptLauf(lauf!);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode ?? 500;
      return reply.status(status).send({ error: (e as Error).message });
    }
  });

  // --- GET /system/update/lauf/aktuell ---
  app.get("/system/update/lauf/aktuell", { preHandler: requireAuth }, async (_req, reply) => {
    const l = getAktuellerLauf();
    if (!l) return reply.status(204).send();
    return adaptLauf(l);
  });

  // --- GET /system/update/lauf/:id ---
  app.get<{ Params: { id: string } }>("/system/update/lauf/:id", { preHandler: requireAuth }, async (req, reply) => {
    const l = getLauf(req.params.id);
    if (!l) return reply.status(404).send({ error: "Lauf nicht gefunden" });
    return adaptLauf(l);
  });

  // --- POST /system/update/rollback/:version ---
  const rollbackBodySchema = z.object({ passwort: z.string().min(1).max(200) });
  app.post<{ Params: { version: string } }>("/system/update/rollback/:version", {
    preHandler: requireAuth,
  }, async (req, reply) => {
    const userId = req.user!.id;
    const fail = rollbackFails.get(userId);
    if (fail && fail.until > Date.now()) {
      return reply.status(429).send({
        error: `Zu viele Fehlversuche — gesperrt bis ${new Date(fail.until).toISOString()}`,
      });
    }
    const parsed = rollbackBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Passwort fehlt" });

    // Passwort gegen DB prüfen
    const row = getDatabase()
      .prepare(`SELECT password_hash FROM app_user WHERE id = ?`)
      .get(userId) as { password_hash: string } | undefined;
    if (!row) return reply.status(401).send({ error: "Benutzer unbekannt" });
    const ok = await verifyPassword(row.password_hash, parsed.data.passwort);
    if (!ok) {
      const next = (fail?.count ?? 0) + 1;
      const until = next >= 3 ? Date.now() + 15 * 60_000 : 0;
      rollbackFails.set(userId, { count: next, until });
      audit({ userId, ip: req.ip, action: "system.update.rollback_pw_fehler", detail: { count: next } });
      return reply.status(401).send({ error: "Passwort falsch" });
    }
    rollbackFails.delete(userId);

    if (isUpdateRunning()) {
      return reply.status(409).send({ error: "Es läuft bereits ein Update — bitte warten" });
    }

    // Rollback NUR auf den direkten Vorgänger erlaubt — kein Mehrfach-Sprung.
    const prev = getPreviousVersionStamp();
    if (!prev) {
      return reply.status(400).send({ error: "Keine vorherige Version verfügbar." });
    }
    if (req.params.version !== prev) {
      return reply.status(400).send({
        error: `Rollback nur auf den direkten Vorgänger erlaubt (${prev}).`,
      });
    }

    try {
      const { laufId } = await manualRollback(req.params.version, userId);
      audit({ userId, ip: req.ip, action: "system.update.rollback_start", detail: { laufId, version: req.params.version } });
      const l = getLauf(laufId);
      return adaptLauf(l!);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode ?? 500;
      return reply.status(status).send({ error: (e as Error).message });
    }
  });
}
