// REST-Routen für GitHub-basiertes One-Click-Update.
//   GET    /system/github/status?refresh=1
//   POST   /system/github/verbinden    body: { repo, branch, autoCheck, token }
//   POST   /system/github/trennen
//   POST   /system/github/pruefen      (force-refresh)
//   POST   /system/github/install      (lädt + installiert in einem Rutsch)
//
// Sicherheit: alle Routen hinter requireAuth, /install zusätzlich rate-limited.
// Daten-Garantie: identisch zur ZIP-Pipeline — nur Code-Verzeichnis wird angefasst.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { audit } from "../auth/audit.js";
import { setSetting } from "../settings/store.js";
import {
  GithubUpdateSchema,
  GithubTokenSchema,
  SENSITIVE_KEYS,
} from "../settings/schemas.js";
import {
  buildStatus,
  disconnectGithub,
  fetchLatestCommit,
  loadGithubSettings,
  prepareUpdateFromGithub,
  saveGithubSettings,
  markInstalledCommit,
  GithubError,
} from "../system/github-source.js";
import { startInstall } from "../system/runner.js";
import { getLauf } from "../system/repo.js";
import { on } from "../events/bus.js";

export async function systemGithubRoutes(app: FastifyInstance): Promise<void> {
  // --- GET /system/github/status ---
  app.get<{ Querystring: { refresh?: string } }>(
    "/system/github/status",
    { preHandler: requireAuth },
    async (req) => {
      const refresh = req.query?.refresh === "1" || req.query?.refresh === "true";
      return buildStatus({ refresh });
    },
  );

  // --- POST /system/github/verbinden ---
  // Speichert Settings + PAT (verschlüsselt) und prüft sofort die Verbindung.
  const verbindenSchema = GithubUpdateSchema.extend({
    token: z.string().min(20).max(500).optional(),  // optional: Settings-Update ohne Token-Wechsel
  });
  app.post(
    "/system/github/verbinden",
    {
      preHandler: requireAuth,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const parsed = verbindenSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" });
      }
      const { token, ...settings } = parsed.data;
      if (!settings.repo) return reply.status(400).send({ error: "Repository (besitzer/repo) ist Pflicht" });

      // Token speichern, falls geliefert
      if (token) {
        const t = GithubTokenSchema.safeParse({ token });
        if (!t.success) return reply.status(400).send({ error: "Token zu kurz" });
        setSetting(SENSITIVE_KEYS.githubToken, t.data.token, { encrypt: true });
      }
      // Token ist optional — public Repos funktionieren ohne PAT.

      saveGithubSettings(settings);

      // Sofort Verbindung testen
      try {
        const status = await buildStatus({ refresh: true });
        audit({
          userId: req.user!.id,
          ip: req.ip,
          action: "system.github.verbunden",
          detail: { repo: settings.repo, branch: settings.branch, sha: status.remoteCommit ?? null },
        });
        return status;
      } catch (e) {
        const err = e as GithubError;
        return reply
          .status(err.statusCode ?? 502)
          .send({ error: err.message ?? "Verbindungstest fehlgeschlagen" });
      }
    },
  );

  // --- POST /system/github/trennen ---
  app.post(
    "/system/github/trennen",
    { preHandler: requireAuth },
    async (req) => {
      disconnectGithub();
      audit({ userId: req.user!.id, ip: req.ip, action: "system.github.getrennt" });
      return { ok: true };
    },
  );

  // --- POST /system/github/pruefen ---
  app.post(
    "/system/github/pruefen",
    {
      preHandler: requireAuth,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (_req, reply) => {
      try {
        return await buildStatus({ refresh: true });
      } catch (e) {
        const err = e as GithubError;
        return reply.status(err.statusCode ?? 502).send({ error: err.message });
      }
    },
  );

  // --- POST /system/github/install ---
  // Lädt den neuesten Commit, baut ein lokal-signiertes Paket und startet den Runner.
  app.post(
    "/system/github/install",
    {
      preHandler: requireAuth,
      config: { rateLimit: { max: 2, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      try {
        const settings = loadGithubSettings();
        if (!settings.repo) return reply.status(400).send({ error: "Kein Repository konfiguriert" });

        const prepared = await prepareUpdateFromGithub();

        // Beim Erfolg: SHA als installiert merken (per Bus-Listener, einmalig).
        const off = on("system:update:lauf", (p) => {
          if (p.status === "erfolg") {
            try { markInstalledCommit(prepared.sha); } catch { /* ignore */ }
            off();
          } else if (p.status === "fehler") {
            off();
          }
        });

        const { laufId } = startInstall({ uploadId: prepared.uploadId, userId: req.user!.id });
        audit({
          userId: req.user!.id,
          ip: req.ip,
          action: "system.github.update_gestartet",
          detail: { laufId, sha: prepared.sha, version: prepared.version },
        });

        const lauf = getLauf(laufId);
        return {
          uploadId: prepared.uploadId,
          version: prepared.version,
          fileName: prepared.fileName,
          sizeBytes: prepared.sizeBytes,
          pendingMigrations: prepared.pendingMigrations,
          warnings: prepared.warnings,
          sha: prepared.sha,
          lauf: lauf ? {
            id: lauf.id,
            von: lauf.vorherigeVersion,
            zu: lauf.neueVersion,
            startetAm: lauf.gestartetAm,
            beendetAm: lauf.beendetAm,
            status: lauf.status,
            quelle: lauf.quelle,
            steps: lauf.steps.map((s) => ({
              id: s.stepId,
              label: s.label,
              status: s.status,
              detail: s.detail ?? undefined,
              fehlerGrund: s.fehlerText ?? undefined,
            })),
          } : null,
        };
      } catch (e) {
        const err = e as GithubError;
        const status = err.statusCode ?? 500;
        return reply.status(status).send({ error: err.message });
      }
    },
  );
}
