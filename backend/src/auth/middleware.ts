// requireAuth-Middleware (Fastify preHandler).
import type { FastifyReply, FastifyRequest } from "fastify";
import { resolveSession, SESSION_COOKIE } from "./sessions.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: { id: string; username: string };
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
  const token = cookies?.[SESSION_COOKIE];
  const sess = token ? resolveSession(token) : null;
  if (!sess) {
    reply.status(401).send({ error: "unauthenticated" });
    return;
  }
  req.user = { id: sess.userId, username: sess.username };
}
