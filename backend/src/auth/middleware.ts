// requireAuth-Middleware (Fastify preHandler) + Cookie-Helpers.
// Single-User-Modus: keine Rollen, kein RBAC.
import type { FastifyReply, FastifyRequest } from "fastify";
import { resolveSession, SESSION_COOKIE, SLIDING_DAYS } from "./sessions.js";

// Secure-Cookies NUR aktivieren, wenn das Backend hinter HTTPS läuft.
// Im normalen Pi-LAN-Betrieb wird per http://<ip>:8787 zugegriffen — dann
// würden Browser ein `Secure`-Cookie nicht senden und der User wäre dauernd
// "unauthenticated". Daher explizit über COOKIE_SECURE steuern, NICHT über
// NODE_ENV. Standard im Production-Modus: aus.
const COOKIE_SECURE =
  String(process.env.COOKIE_SECURE ?? "").toLowerCase() === "true" ||
  process.env.COOKIE_SECURE === "1";

declare module "fastify" {
  interface FastifyRequest {
    user?: { id: string; username: string };
  }
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    path: "/",
    maxAge: SLIDING_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function getCookieToken(req: FastifyRequest): string | undefined {
  const c = (req as unknown as { cookies?: Record<string, string> }).cookies;
  return c?.[SESSION_COOKIE];
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = getCookieToken(req);
  const sess = token ? resolveSession(token) : null;
  if (!sess) {
    reply.status(401).send({ error: "unauthenticated" });
    return;
  }
  const { findeBenutzer } = await import("./users-repo.js");
  const u = findeBenutzer(sess.userId);
  if (!u) {
    reply.status(401).send({ error: "unauthenticated" });
    return;
  }
  req.user = { id: sess.userId, username: sess.username };
  if (sess.refreshed) {
    setSessionCookie(reply, sess.token);
  }
}
