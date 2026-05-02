// /email/* — Vorlagen, Signaturen, Versand-Queue, Test.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import {
  listVorlagen, getVorlage, createVorlage, updateVorlage, deleteVorlage,
  listSignaturen, getSignatur, createSignatur, updateSignatur, deleteSignatur,
  type EmailKontext,
} from "../email/templates.js";
import {
  enqueueVersand, getById, listVersand, retry, abbrechen,
  type EmailVersandStatus,
} from "../email/versand-repo.js";
import { tickEmailQueue } from "../email/worker.js";
import { getTransport, getFromAddress, loadSmtpRuntime } from "../email/transport.js";

const KONTEXTE = ["rechnung", "angebot", "mahnung", "allgemein"] as const;

const VorlageSchema = z.object({
  name: z.string().trim().min(1).max(200),
  betreff: z.string().trim().max(500).default(""),
  bodyHtml: z.string().max(50_000).default(""),
  kontext: z.enum(KONTEXTE),
  istStandard: z.boolean().default(false),
});
const SignaturSchema = z.object({
  name: z.string().trim().min(1).max(200),
  html: z.string().max(20_000).default(""),
  istStandard: z.boolean().default(false),
});
const VersandSchema = z.object({
  empfaengerTo: z.string().trim().email().max(320),
  empfaengerCc: z.string().trim().max(2000).optional(),
  empfaengerBcc: z.string().trim().max(2000).optional(),
  betreff: z.string().trim().max(500),
  bodyHtml: z.string().max(100_000),
  belegArt: z.enum(["angebot", "rechnung"]).optional(),
  belegId: z.string().optional(),
  vorlageId: z.string().optional(),
  signaturId: z.string().optional(),
  idempotenzKey: z.string().min(1).max(200),
});

export async function emailRoutes(app: FastifyInstance): Promise<void> {
  app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);

    // ---- Vorlagen ----
    scoped.get("/email/vorlagen", async (req) => {
      const q = z.object({ kontext: z.enum(KONTEXTE).optional() }).parse(req.query ?? {});
      return listVorlagen(q.kontext as EmailKontext | undefined);
    });
    scoped.post("/email/vorlagen", async (req, reply) => {
      const p = VorlageSchema.partial({ kontext: true }).safeParse(req.body);
      if (!p.success) { reply.status(422); return { error: "validation", issues: p.error.issues }; }
      return createVorlage({ ...p.data, kontext: (p.data.kontext ?? "allgemein") as EmailKontext });
    });
    scoped.patch<{ Params: { id: string } }>("/email/vorlagen/:id", async (req, reply) => {
      const p = VorlageSchema.partial().safeParse(req.body);
      if (!p.success) { reply.status(422); return { error: "validation", issues: p.error.issues }; }
      const upd = updateVorlage(req.params.id, p.data);
      if (!upd) { reply.status(404); return { error: "not-found" }; }
      return upd;
    });
    scoped.delete<{ Params: { id: string } }>("/email/vorlagen/:id", async (req, reply) => {
      if (!deleteVorlage(req.params.id)) { reply.status(404); return { error: "not-found" }; }
      return { ok: true };
    });

    // ---- Signaturen ----
    scoped.get("/email/signaturen", async () => listSignaturen());
    scoped.post("/email/signaturen", async (req, reply) => {
      const p = SignaturSchema.partial({ name: true }).safeParse(req.body);
      if (!p.success) { reply.status(422); return { error: "validation", issues: p.error.issues }; }
      return createSignatur(p.data);
    });
    scoped.patch<{ Params: { id: string } }>("/email/signaturen/:id", async (req, reply) => {
      const p = SignaturSchema.partial().safeParse(req.body);
      if (!p.success) { reply.status(422); return { error: "validation", issues: p.error.issues }; }
      const upd = updateSignatur(req.params.id, p.data);
      if (!upd) { reply.status(404); return { error: "not-found" }; }
      return upd;
    });
    scoped.delete<{ Params: { id: string } }>("/email/signaturen/:id", async (req, reply) => {
      if (!deleteSignatur(req.params.id)) { reply.status(404); return { error: "not-found" }; }
      return { ok: true };
    });

    // ---- Versand ----
    scoped.get("/email/versand", async (req) => {
      const q = z.object({
        status: z.enum(["pending", "sending", "gesendet", "fehler", "manuell"]).optional(),
        beleg_id: z.string().optional(),
        q: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
        offset: z.coerce.number().int().min(0).optional(),
      }).parse(req.query ?? {});
      return listVersand({
        status: q.status as EmailVersandStatus | undefined,
        belegId: q.beleg_id, q: q.q, limit: q.limit, offset: q.offset,
      });
    });
    scoped.get<{ Params: { id: string } }>("/email/versand/:id", async (req, reply) => {
      const r = getById(req.params.id);
      if (!r) { reply.status(404); return { error: "not-found" }; }
      return r;
    });
    scoped.post("/email/versand", async (req, reply) => {
      const p = VersandSchema.safeParse(req.body);
      if (!p.success) { reply.status(422); return { error: "validation", issues: p.error.issues }; }
      const { row, created } = enqueueVersand(p.data);
      // Sofort versuchen zu senden, damit der User schnelles Feedback bekommt
      if (created) void tickEmailQueue(1).catch(() => undefined);
      reply.status(created ? 201 : 200);
      return row;
    });
    scoped.post<{ Params: { id: string } }>("/email/versand/:id/retry", async (req, reply) => {
      if (!retry(req.params.id)) { reply.status(404); return { error: "not-found" }; }
      void tickEmailQueue(1).catch(() => undefined);
      return getById(req.params.id);
    });
    scoped.post<{ Params: { id: string } }>("/email/versand/:id/abbrechen", async (req, reply) => {
      if (!abbrechen(req.params.id)) { reply.status(404); return { error: "not-found" }; }
      return getById(req.params.id);
    });

    // ---- Echter Test-Versand ----
    scoped.post("/email/test", async (req, reply) => {
      const p = z.object({ an: z.string().trim().email() }).safeParse(req.body);
      if (!p.success) { reply.status(422); return { error: "validation" }; }
      if (!loadSmtpRuntime()) { reply.status(400); return { error: "smtp-nicht-konfiguriert" }; }
      try {
        const t = getTransport();
        const from = getFromAddress();
        const info = await t.sendMail({
          from: { name: from.name, address: from.address },
          to: p.data.an,
          subject: "MyCleanCenter — Test-Mail",
          html: "<p>Diese Test-Mail wurde von Ihrem MyCleanCenter-System erfolgreich versendet.</p>",
        });
        return { ok: true, messageId: info.messageId };
      } catch (e) {
        reply.status(500);
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    });
  });
}
