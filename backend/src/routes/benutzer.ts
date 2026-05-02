// /benutzer/* — Owner-only Verwaltung von Mitarbeitern.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireOwner } from "../auth/middleware.js";
import {
  legeBenutzerAn,
  listeBenutzer,
  setzeAktiv,
  setzeNeuesPasswort,
  setzeRolle,
  rotiereRecovery,
  findeBenutzer,
} from "../auth/users-repo.js";
import { audit } from "../auth/audit.js";
import { deleteAllSessionsForUser } from "../auth/sessions.js";
import { generateRecoveryCode } from "../auth/recovery.js";

const PasswortPolicy = z
  .string()
  .min(12)
  .max(200)
  .refine((s) => /[0-9]/.test(s))
  .refine((s) => /[^A-Za-z0-9]/.test(s));

const AnlegenSchema = z.object({
  username: z.string().trim().min(3).max(120),
  rolle: z.enum(["owner", "mitarbeiter"]),
  initialPasswort: PasswortPolicy.optional(),
});

const PatchSchema = z.object({
  rolle: z.enum(["owner", "mitarbeiter"]).optional(),
  aktiv: z.boolean().optional(),
});

const ResetSchema = z.object({
  neuesPasswort: PasswortPolicy.optional(),
});

function generateInitialPasswort(): string {
  // 16-stellig, mit Ziffer und Sonderzeichen für Policy.
  const code = generateRecoveryCode().replace(/-/g, "").slice(0, 14);
  return code + "9!";
}

export async function benutzerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/benutzer", { preHandler: requireOwner }, async () => {
    return { benutzer: listeBenutzer() };
  });

  app.post("/benutzer", { preHandler: requireOwner }, async (req, reply) => {
    const parsed = AnlegenSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.status(422);
      return { error: "validation", issues: parsed.error.issues };
    }
    const initial = parsed.data.initialPasswort ?? generateInitialPasswort();
    try {
      const res = await legeBenutzerAn({
        username: parsed.data.username,
        rolle: parsed.data.rolle,
        initialPasswort: initial,
      });
      audit({
        userId: req.user!.id,
        action: "benutzer.anlegen",
        detail: { neueId: res.id, username: res.username, rolle: res.rolle },
        ip: req.ip,
      });
      return { ...res, initialPasswort: initial };
    } catch (err) {
      if ((err as Error & { code?: string }).code === "username-conflict") {
        reply.status(409);
        return { error: "username-conflict" };
      }
      throw err;
    }
  });

  app.patch<{ Params: { id: string } }>(
    "/benutzer/:id",
    { preHandler: requireOwner },
    async (req, reply) => {
      const parsed = PatchSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.status(422);
        return { error: "validation", issues: parsed.error.issues };
      }
      const u = findeBenutzer(req.params.id);
      if (!u) {
        reply.status(404);
        return { error: "not-found" };
      }
      // Self-Lockout-Schutz
      if (req.params.id === req.user!.id) {
        if (parsed.data.aktiv === false) {
          reply.status(409);
          return { error: "self-deactivate-forbidden" };
        }
        if (parsed.data.rolle && parsed.data.rolle !== "owner") {
          reply.status(409);
          return { error: "self-demote-forbidden" };
        }
      }
      try {
        if (parsed.data.rolle) setzeRolle(req.params.id, parsed.data.rolle);
        if (parsed.data.aktiv !== undefined) setzeAktiv(req.params.id, parsed.data.aktiv);
      } catch (err) {
        if ((err as Error & { code?: string }).code === "last-owner") {
          reply.status(409);
          return { error: "last-owner" };
        }
        throw err;
      }
      audit({
        userId: req.user!.id,
        action: "benutzer.patch",
        detail: { id: req.params.id, ...parsed.data },
        ip: req.ip,
      });
      // Bei Deaktivierung Sessions beenden
      if (parsed.data.aktiv === false) deleteAllSessionsForUser(req.params.id);
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/benutzer/:id/passwort-zuruecksetzen",
    { preHandler: requireOwner },
    async (req, reply) => {
      const parsed = ResetSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        reply.status(422);
        return { error: "validation", issues: parsed.error.issues };
      }
      const u = findeBenutzer(req.params.id);
      if (!u) {
        reply.status(404);
        return { error: "not-found" };
      }
      const initial = parsed.data.neuesPasswort ?? generateInitialPasswort();
      await setzeNeuesPasswort(req.params.id, initial);
      const recoveryCode = await rotiereRecovery(req.params.id);
      deleteAllSessionsForUser(req.params.id);
      audit({
        userId: req.user!.id,
        action: "benutzer.passwort-reset",
        detail: { id: req.params.id },
        ip: req.ip,
      });
      return { ok: true, initialPasswort: initial, recoveryCode };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/benutzer/:id",
    { preHandler: requireOwner },
    async (req, reply) => {
      if (req.params.id === req.user!.id) {
        reply.status(409);
        return { error: "self-delete-forbidden" };
      }
      const u = findeBenutzer(req.params.id);
      if (!u) {
        reply.status(404);
        return { error: "not-found" };
      }
      try {
        setzeAktiv(req.params.id, false);
      } catch (err) {
        if ((err as Error & { code?: string }).code === "last-owner") {
          reply.status(409);
          return { error: "last-owner" };
        }
        throw err;
      }
      deleteAllSessionsForUser(req.params.id);
      audit({
        userId: req.user!.id,
        action: "benutzer.deaktivieren",
        detail: { id: req.params.id },
        ip: req.ip,
      });
      return { ok: true };
    },
  );
}
