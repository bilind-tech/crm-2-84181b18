// /einstellungen/* — alle hinter requireAuth.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  AREAS,
  SENSITIVE_KEYS,
  SmtpPasswordSchema,
  GoogleDriveSecretSchema,
} from "../settings/schemas.js";
import {
  deleteSetting,
  getSetting,
  getSettingMeta,
  setSetting,
} from "../settings/store.js";
import { requireAuth, getCookieToken } from "../auth/middleware.js";
import { audit } from "../auth/audit.js";
import {
  deleteAllSessionsForUser,
  deleteSessionForUser,
  listSessions,
} from "../auth/sessions.js";
import { createConnection } from "node:net";

function loadArea(name: keyof typeof AREAS): unknown {
  const a = AREAS[name];
  const stored = getSetting(a.key);
  return a.schema.parse(stored ?? {});
}

/**
 * Patch-Semantik:
 * 1. Body gegen Partial-Schema validieren (nur gesetzte Felder).
 * 2. Mit aktuellem Stand mergen.
 * 3. Gegen Vollschema validieren (Defaults bleiben für ungesetzte Felder erhalten).
 * Leere Strings werden als gewollte Werte beibehalten (kein silent revert).
 */
function patchArea(
  name: keyof typeof AREAS,
  body: unknown,
):
  | { ok: true; value: unknown }
  | { ok: false; status: number; error: string; issues?: unknown } {
  const a = AREAS[name];
  // Partial-Validierung: nur Felder die der Client schickt
  const partialSchema =
    "partial" in a.schema && typeof (a.schema as { partial: () => unknown }).partial === "function"
      ? ((a.schema as unknown as { partial: () => z.ZodTypeAny }).partial())
      : a.schema;
  const partial = partialSchema.safeParse(body ?? {});
  if (!partial.success) {
    return { ok: false, status: 422, error: "validation", issues: partial.error.issues };
  }
  const current = a.schema.parse(getSetting(a.key) ?? {}) as Record<string, unknown>;
  const merged = { ...current, ...(partial.data as Record<string, unknown>) };
  const parsed = a.schema.safeParse(merged);
  if (!parsed.success) {
    return { ok: false, status: 422, error: "validation", issues: parsed.error.issues };
  }
  setSetting(a.key, parsed.data, { encrypt: a.encrypted });
  return { ok: true, value: parsed.data };
}

export async function einstellungenRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  const simpleAreas: Array<keyof typeof AREAS> = [
    "firma",
    "nummernkreise",
    "sicherheit",
    "erscheinung",
    "backup",
    "mahnung",
    "dauerauftrag",
    "steuer",
    "stundenzettel",
  ];
  for (const a of simpleAreas) {
    app.get(`/einstellungen/${a}`, async () => loadArea(a));
    app.patch(`/einstellungen/${a}`, async (req, reply) => {
      const r = patchArea(a, req.body);
      if (!r.ok) {
        reply.status(r.status);
        return { error: r.error, issues: r.issues };
      }
      audit({ userId: req.user?.id, action: `settings.${a}.patch`, ip: req.ip });
      return r.value;
    });
  }

  // SMTP — Passwort separat verschlüsselt
  app.get("/einstellungen/smtp", async () => {
    const base = loadArea("smtp");
    const meta = getSettingMeta(SENSITIVE_KEYS.smtpPassword);
    return {
      ...(base as object),
      passwordIsSet: meta.exists,
      passwordUpdatedAt: meta.updatedAt,
    };
  });
  app.patch("/einstellungen/smtp", async (req, reply) => {
    const body = { ...((req.body ?? {}) as Record<string, unknown>) };
    if (typeof body.password === "string" && body.password.length > 0) {
      const pw = SmtpPasswordSchema.safeParse({ password: body.password });
      if (!pw.success) {
        reply.status(422);
        return { error: "validation", issues: pw.error.issues };
      }
      setSetting(SENSITIVE_KEYS.smtpPassword, pw.data.password, { encrypt: true });
    }
    delete body.password;
    delete body.passwordIsSet;
    delete body.passwordUpdatedAt;
    const r = patchArea("smtp", body);
    if (!r.ok) {
      reply.status(r.status);
      return { error: r.error, issues: r.issues };
    }
    audit({ userId: req.user?.id, action: "settings.smtp.patch", ip: req.ip });
    const meta = getSettingMeta(SENSITIVE_KEYS.smtpPassword);
    return { ...(r.value as object), passwordIsSet: meta.exists, passwordUpdatedAt: meta.updatedAt };
  });
  app.delete("/einstellungen/smtp/passwort", async (req) => {
    deleteSetting(SENSITIVE_KEYS.smtpPassword);
    audit({ userId: req.user?.id, action: "settings.smtp.password-clear", ip: req.ip });
    return { ok: true };
  });
  app.post("/einstellungen/smtp/test", async () => {
    const cfg = loadArea("smtp") as { host: string; port: number };
    if (!cfg.host) return { ok: false, error: "host fehlt" };
    return await new Promise<{ ok: boolean; latencyMs?: number; error?: string }>((resolve) => {
      const t0 = Date.now();
      const sock = createConnection({ host: cfg.host, port: cfg.port, timeout: 4000 });
      const done = (res: { ok: boolean; latencyMs?: number; error?: string }): void => {
        try {
          sock.destroy();
        } catch {
          /* ignore */
        }
        resolve(res);
      };
      sock.once("connect", () => done({ ok: true, latencyMs: Date.now() - t0 }));
      sock.once("timeout", () => done({ ok: false, error: "Timeout" }));
      sock.once("error", (e) => done({ ok: false, error: e.message }));
    });
  });

  // Google Drive
  app.get("/einstellungen/google-drive", async () => {
    const base = loadArea("googleDrive");
    const sec = getSettingMeta(SENSITIVE_KEYS.googleClientSecret);
    const tok = getSettingMeta(SENSITIVE_KEYS.googleRefreshToken);
    return {
      ...(base as object),
      clientSecretIsSet: sec.exists,
      refreshTokenIsSet: tok.exists,
      connected: tok.exists,
    };
  });
  app.patch("/einstellungen/google-drive", async (req, reply) => {
    const body = { ...((req.body ?? {}) as Record<string, unknown>) };
    const secrets = GoogleDriveSecretSchema.safeParse({
      clientSecret: body.clientSecret,
      refreshToken: body.refreshToken,
    });
    if (!secrets.success) {
      reply.status(422);
      return { error: "validation", issues: secrets.error.issues };
    }
    if (secrets.data.clientSecret) {
      setSetting(SENSITIVE_KEYS.googleClientSecret, secrets.data.clientSecret, { encrypt: true });
    }
    if (secrets.data.refreshToken) {
      setSetting(SENSITIVE_KEYS.googleRefreshToken, secrets.data.refreshToken, { encrypt: true });
    }
    delete body.clientSecret;
    delete body.refreshToken;
    delete body.clientSecretIsSet;
    delete body.refreshTokenIsSet;
    delete body.connected;
    const r = patchArea("googleDrive", body);
    if (!r.ok) {
      reply.status(r.status);
      return { error: r.error, issues: r.issues };
    }
    audit({ userId: req.user?.id, action: "settings.google-drive.patch", ip: req.ip });
    const sec = getSettingMeta(SENSITIVE_KEYS.googleClientSecret);
    const tok = getSettingMeta(SENSITIVE_KEYS.googleRefreshToken);
    return {
      ...(r.value as object),
      clientSecretIsSet: sec.exists,
      refreshTokenIsSet: tok.exists,
      connected: tok.exists,
    };
  });
  app.post("/einstellungen/google-drive/disconnect", async (req) => {
    deleteSetting(SENSITIVE_KEYS.googleRefreshToken);
    audit({ userId: req.user?.id, action: "settings.google-drive.disconnect", ip: req.ip });
    return { ok: true };
  });

  // Sessions
  app.get("/einstellungen/sitzungen", async (req) => {
    if (!req.user) return [];
    const currentToken = getCookieToken(req);
    return listSessions(req.user.id).map((s) => ({ ...s, isCurrent: s.token === currentToken }));
  });
  app.delete("/einstellungen/sitzungen/:token", async (req, reply) => {
    if (!req.user) {
      reply.status(401);
      return { error: "unauthenticated" };
    }
    const params = z.object({ token: z.string().min(1) }).safeParse(req.params);
    if (!params.success) {
      reply.status(422);
      return { error: "validation" };
    }
    const ok = deleteSessionForUser(params.data.token, req.user.id);
    if (!ok) {
      reply.status(404);
      return { error: "not-found" };
    }
    audit({ userId: req.user.id, action: "settings.sessions.revoke", ip: req.ip });
    return { ok: true };
  });
  app.post("/einstellungen/sitzungen/alle-beenden", async (req) => {
    if (!req.user) return { revoked: 0 };
    const currentToken = getCookieToken(req);
    const n = deleteAllSessionsForUser(req.user.id, currentToken);
    audit({
      userId: req.user.id,
      action: "settings.sessions.revoke-all",
      detail: { revoked: n },
      ip: req.ip,
    });
    return { revoked: n };
  });
}
