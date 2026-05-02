// /auth/* Routen.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../db/index.js";
import { hashPassword, verifyPassword, getDummyHash } from "../auth/password.js";
import {
  createSession,
  deleteSession,
  resolveSession,
  listSessions,
  deleteAllSessionsForUser,
  deleteSessionForUser,
} from "../auth/sessions.js";
import { getStatus, recordFailure, recordSuccess } from "../auth/lockout.js";
import { audit } from "../auth/audit.js";
import { emit } from "../events/bus.js";
import {
  checkAndConsumeSetupToken,
  ensureSetupToken,
  markSetupComplete,
  userCount,
} from "../auth/setup-token.js";
import {
  clearSessionCookie,
  getCookieToken,
  requireAuth,
  setSessionCookie,
} from "../auth/middleware.js";
import {
  findeBenutzer,
  findeBenutzerByUsername,
  rotiereRecovery,
  setzeNeuesPasswort,
} from "../auth/users-repo.js";
import {
  generateRecoveryCode,
  hashRecoveryCode,
  markRecoveryConsumed,
  verifyRecoveryCode,
} from "../auth/recovery.js";

const PasswortPolicy = z
  .string()
  .min(12, "Mindestens 12 Zeichen")
  .max(200)
  .refine((s) => /[0-9]/.test(s), "Mindestens eine Ziffer")
  .refine((s) => /[^A-Za-z0-9]/.test(s), "Mindestens ein Sonderzeichen");

const LoginSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(500),
});

const SetupSchema = z.object({
  username: z.string().trim().min(3).max(120),
  password: PasswortPolicy,
  setupToken: z.string().trim().min(1).max(200),
});

const ChangePwSchema = z.object({
  alt: z.string().min(1).max(500),
  neu: PasswortPolicy,
});

const RecoveryUseSchema = z.object({
  username: z.string().trim().min(1).max(120),
  recoveryCode: z.string().trim().min(1).max(64),
  neuesPasswort: PasswortPolicy,
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  ensureSetupToken((line) => app.log.info(line));

  app.get("/auth/me", async (req, reply) => {
    if (userCount() === 0) {
      reply.status(409);
      return { error: "needs-setup", message: "Bitte Ersteinrichtung durchführen." };
    }
    const token = getCookieToken(req);
    const sess = token ? resolveSession(token) : null;
    if (!sess) {
      reply.status(401);
      return { error: "unauthenticated" };
    }
    const u = findeBenutzer(sess.userId);
    if (!u || u.aktiv !== 1) {
      deleteSession(sess.token);
      clearSessionCookie(reply);
      reply.status(401);
      return { error: "unauthenticated" };
    }
    if (sess.refreshed) setSessionCookie(reply, sess.token);
    return {
      user: { id: sess.userId, username: sess.username, rolle: u.rolle },
      expiresAt: sess.expiresAt,
    };
  });

  app.post("/auth/setup", async (req, reply) => {
    const parsed = SetupSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.status(422);
      return { error: "validation", issues: parsed.error.issues };
    }
    if (userCount() > 0) {
      reply.status(409);
      return { error: "already-setup" };
    }
    if (!checkAndConsumeSetupToken(parsed.data.setupToken)) {
      reply.status(401);
      return { error: "invalid-setup-token" };
    }
    const id = randomUUID();
    const hash = await hashPassword(parsed.data.password);
    const recoveryCode = generateRecoveryCode();
    const recHash = await hashRecoveryCode(recoveryCode);
    getDatabase()
      .prepare(
        `INSERT INTO app_user (id, username, password_hash, rolle, recovery_hash, aktiv, created_at, updated_at)
         VALUES (?, ?, ?, 'owner', ?, 1, datetime('now'), datetime('now'))`,
      )
      .run(id, parsed.data.username, hash, recHash);
    markSetupComplete();

    const sess = createSession(id, req.headers["user-agent"], req.ip);
    setSessionCookie(reply, sess.token);
    audit({ userId: id, action: "auth.setup", ip: req.ip });
    return {
      user: { id, username: parsed.data.username, rolle: "owner" as const },
      expiresAt: sess.expiresAt,
      recoveryCode,
    };
  });

  app.post(
    "/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const parsed = LoginSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.status(422);
        return { error: "validation" };
      }
      const { username, password } = parsed.data;

      const lock = getStatus(req.ip, username);
      if (lock.locked) {
        reply.status(423);
        return { error: "locked", lockedUntil: lock.lockedUntil };
      }

      const user = findeBenutzerByUsername(username);
      const hashToCheck = user?.password_hash ?? (await getDummyHash());
      const passwordOk = await verifyPassword(hashToCheck, password);
      const ok = !!user && user.aktiv === 1 && passwordOk;

      if (!ok) {
        const status = recordFailure(req.ip, username);
        audit({ action: "auth.login.fail", detail: { username }, ip: req.ip });
        if (status.locked) {
          reply.status(423);
          return { error: "locked", lockedUntil: status.lockedUntil };
        }
        reply.status(401);
        return { error: "invalid-credentials" };
      }
      recordSuccess(req.ip, username);
      const sess = createSession(user!.id, req.headers["user-agent"], req.ip);
      setSessionCookie(reply, sess.token);
      audit({ userId: user!.id, action: "auth.login", ip: req.ip });
      emit("auth:login", { userId: user!.id, username: user!.username, ip: req.ip });
      return {
        user: { id: user!.id, username: user!.username, rolle: user!.rolle },
        expiresAt: sess.expiresAt,
      };
    },
  );

  app.post("/auth/logout", async (req, reply) => {
    const token = getCookieToken(req);
    if (token) {
      const sess = resolveSession(token);
      if (sess) {
        audit({ userId: sess.userId, action: "auth.logout", ip: req.ip });
        emit("auth:logout", { userId: sess.userId });
      }
      deleteSession(token);
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.post("/auth/passwort-aendern", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = ChangePwSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.status(422);
      return { error: "validation", issues: parsed.error.issues };
    }
    const row = getDatabase()
      .prepare(`SELECT password_hash FROM app_user WHERE id = ?`)
      .get(req.user!.id) as { password_hash: string } | undefined;
    if (!row) {
      reply.status(401);
      return { error: "unauthenticated" };
    }
    const ok = await verifyPassword(row.password_hash, parsed.data.alt);
    if (!ok) {
      reply.status(401);
      return { error: "wrong-password" };
    }
    await setzeNeuesPasswort(req.user!.id, parsed.data.neu);
    audit({ userId: req.user!.id, action: "auth.password-change", ip: req.ip });
    return { ok: true };
  });

  // ---------- Sessions ----------

  app.get("/auth/sessions", { preHandler: requireAuth }, async (req) => {
    const currentToken = getCookieToken(req);
    const items = listSessions(req.user!.id).map((s) => ({
      id: s.token.slice(0, 12),
      tokenHint: s.token.slice(0, 6) + "…",
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      expiresAt: s.expiresAt,
      userAgent: s.userAgent,
      ip: s.ip,
      current: s.token === currentToken,
      _t: s.token,
    }));
    return { sessions: items };
  });

  app.delete("/auth/sessions", { preHandler: requireAuth }, async (req) => {
    const currentToken = getCookieToken(req);
    const n = deleteAllSessionsForUser(req.user!.id, currentToken ?? undefined);
    audit({ userId: req.user!.id, action: "auth.sessions.revoke-all", ip: req.ip });
    return { ok: true, beendet: n };
  });

  app.delete<{ Params: { token: string } }>(
    "/auth/sessions/:token",
    { preHandler: requireAuth },
    async (req, reply) => {
      // /auth/sessions liefert vollen Token unter `_t` — Frontend nutzt diesen.
      const ok = deleteSessionForUser(req.params.token, req.user!.id);
      if (!ok) {
        reply.status(404);
        return { error: "not-found" };
      }
      audit({ userId: req.user!.id, action: "auth.session.revoke", ip: req.ip });
      return { ok: true };
    },
  );

  // ---------- Recovery ----------

  app.post(
    "/auth/recovery/verwenden",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const parsed = RecoveryUseSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.status(422);
        return { error: "validation", issues: parsed.error.issues };
      }
      const u = findeBenutzerByUsername(parsed.data.username);
      // Konstantzeit: dummy verify wenn User fehlt
      if (!u || !u.recovery_hash || u.recovery_used_at !== null || u.aktiv !== 1) {
        await verifyRecoveryCode(await getDummyHash(), parsed.data.recoveryCode);
        audit({ action: "auth.recovery.fail", detail: { username: parsed.data.username }, ip: req.ip });
        reply.status(401);
        return { error: "invalid-recovery" };
      }
      const ok = await verifyRecoveryCode(u.recovery_hash, parsed.data.recoveryCode);
      if (!ok) {
        audit({ userId: u.id, action: "auth.recovery.fail", ip: req.ip });
        reply.status(401);
        return { error: "invalid-recovery" };
      }
      await setzeNeuesPasswort(u.id, parsed.data.neuesPasswort);
      markRecoveryConsumed(u.id);
      // Alle bestehenden Sessions invalidieren
      deleteAllSessionsForUser(u.id);
      // Neuen Recovery-Code ausgeben
      const neuerCode = await rotiereRecovery(u.id);
      audit({ userId: u.id, action: "auth.recovery.success", ip: req.ip });
      return { ok: true, recoveryCode: neuerCode };
    },
  );

  app.post(
    "/auth/recovery/regenerieren",
    { preHandler: requireAuth },
    async (req) => {
      const code = await rotiereRecovery(req.user!.id);
      audit({ userId: req.user!.id, action: "auth.recovery.rotate", ip: req.ip });
      return { ok: true, recoveryCode: code };
    },
  );
}
