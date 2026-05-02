// /auth/* Routen.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../db/index.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import {
  createSession,
  deleteSession,
  resolveSession,
  SESSION_COOKIE,
} from "../auth/sessions.js";
import { getStatus, recordFailure, recordSuccess } from "../auth/lockout.js";
import { audit } from "../auth/audit.js";
import {
  checkAndConsumeSetupToken,
  ensureSetupToken,
  userCount,
} from "../auth/setup-token.js";
import { config } from "../config.js";

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

function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.nodeEnv === "production",
    path: "/",
    maxAge: 14 * 24 * 60 * 60,
  });
}
function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

function getCookieToken(req: FastifyRequest): string | undefined {
  const c = (req as unknown as { cookies?: Record<string, string> }).cookies;
  return c?.[SESSION_COOKIE];
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Beim Boot ggf. Setup-Token erzeugen
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
    return {
      user: { id: sess.userId, username: sess.username },
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
    getDatabase()
      .prepare(
        `INSERT INTO app_user (id, username, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
      )
      .run(id, parsed.data.username, hash);

    const sess = createSession(id, req.headers["user-agent"], req.ip);
    setSessionCookie(reply, sess.token);
    audit({ userId: id, action: "auth.setup", ip: req.ip });
    return {
      user: { id, username: parsed.data.username },
      expiresAt: sess.expiresAt,
    };
  });

  app.post("/auth/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
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

    const user = getDatabase()
      .prepare(`SELECT id, username, password_hash FROM app_user WHERE username = ? COLLATE NOCASE`)
      .get(username) as { id: string; username: string; password_hash: string } | undefined;

    const ok = user ? await verifyPassword(user.password_hash, password) : false;
    if (!ok || !user) {
      const status = recordFailure(req.ip, username);
      audit({ action: "auth.login.fail", detail: { username }, ip: req.ip });
      reply.status(401);
      return {
        error: "invalid-credentials",
        failCount: status.failCount,
        locked: status.locked,
        lockedUntil: status.lockedUntil,
      };
    }
    recordSuccess(req.ip, username);
    const sess = createSession(user.id, req.headers["user-agent"], req.ip);
    setSessionCookie(reply, sess.token);
    audit({ userId: user.id, action: "auth.login", ip: req.ip });
    return {
      user: { id: user.id, username: user.username },
      expiresAt: sess.expiresAt,
    };
  });

  app.post("/auth/logout", async (req, reply) => {
    const token = getCookieToken(req);
    if (token) {
      const sess = resolveSession(token);
      if (sess) audit({ userId: sess.userId, action: "auth.logout", ip: req.ip });
      deleteSession(token);
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.post("/auth/passwort-aendern", async (req, reply) => {
    const token = getCookieToken(req);
    const sess = token ? resolveSession(token) : null;
    if (!sess) {
      reply.status(401);
      return { error: "unauthenticated" };
    }
    const parsed = ChangePwSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.status(422);
      return { error: "validation", issues: parsed.error.issues };
    }
    const row = getDatabase()
      .prepare(`SELECT password_hash FROM app_user WHERE id = ?`)
      .get(sess.userId) as { password_hash: string } | undefined;
    if (!row) {
      reply.status(401);
      return { error: "unauthenticated" };
    }
    const ok = await verifyPassword(row.password_hash, parsed.data.alt);
    if (!ok) {
      reply.status(401);
      return { error: "wrong-password" };
    }
    const newHash = await hashPassword(parsed.data.neu);
    getDatabase()
      .prepare(`UPDATE app_user SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(newHash, sess.userId);
    audit({ userId: sess.userId, action: "auth.password-change", ip: req.ip });
    return { ok: true };
  });
}
