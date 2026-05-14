// Step 3: REST-Endpoints für Kunden, Ansprechpartner, Objekte, Notizen + globale Suche.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { audit } from "../auth/audit.js";
import {
  createAnsprechpartner,
  createKunde,
  createNotiz,
  createObjekt,
  deleteAnsprechpartner,
  deleteKunde,
  deleteNotiz,
  deleteObjekt,
  getKunde,
  getObjekt,
  listAnsprechpartner,
  listKunden,
  listNotizenForKunde,
  listObjekte,
  updateAnsprechpartner,
  updateKunde,
  updateObjekt,
} from "../kunden/repo.js";
import { findKuerzelOwner, isKuerzelFormatOk, normalizeKuerzel } from "../kunden/kuerzel.js";
import { listAngebote } from "../belege/angebote-repo.js";
import { listRechnungen } from "../belege/rechnungen-repo.js";
import { listDokumente } from "../dokumente/repo.js";
import { peekBelegNummer, periodeMMYY } from "../kunden/nummern.js";
import { suche } from "../kunden/search.js";

export async function stammdatenRoutes(app: FastifyInstance): Promise<void> {
  app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);

    // ---------------- KUNDEN ----------------
    scoped.get("/kunden", async (req) => {
      const q = req.query as Record<string, string | undefined>;
      return listKunden({
        suche: q.suche,
        status: q.status,
        archiviert: q.archiviert === "true" ? true : q.archiviert === "false" ? false : undefined,
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      });
    });

    scoped.get("/kunden/kuerzel-frei", async (req, reply) => {
      const q = req.query as { kuerzel?: string; exceptId?: string };
      const k = normalizeKuerzel(q.kuerzel ?? "");
      if (!k || !isKuerzelFormatOk(k)) {
        reply.status(422);
        return { error: "format" };
      }
      const owner = findKuerzelOwner(k, q.exceptId);
      return owner ? { frei: false, kunde: owner } : { frei: true };
    });

    scoped.get<{ Params: { id: string } }>("/kunden/:id", async (req, reply) => {
      const k = getKunde(req.params.id);
      if (!k) {
        reply.status(404);
        return { error: "not-found" };
      }
      return {
        ...k,
        ansprechpartner: listAnsprechpartner(k.id),
        objekte: listObjekte(k.id),
        angebote: listAngebote({ kundeId: k.id }),
        rechnungen: listRechnungen({ kundeId: k.id }),
        dokumente: listDokumente({ kundeId: k.id }),
        notizen: listNotizenForKunde(k.id),
      };
    });

    scoped.get<{ Params: { id: string }; Querystring: { art?: string } }>(
      "/kunden/:id/zaehler",
      async (req, reply) => {
        const k = getKunde(req.params.id);
        if (!k) {
          reply.status(404);
          return { error: "not-found" };
        }
        const periode = periodeMMYY();
        const art = req.query?.art === "angebot" ? "angebot" : "rechnung";
        const nn = peekBelegNummer(req.params.id, art, periode);
        // Vorschau-String mit derselben Logik wie die Vergabe.
        const prefix = k.kuerzel?.trim()
          ? k.kuerzel.trim().toUpperCase()
          : (await import("../belege/nummer-format.js")).fallbackPrefix(art, k.nummer);
        const formatted = `${prefix}${periode}/${String(nn).padStart(2, "0")}`;
        return { periode, art, naechsterStart: nn, formatted };
      },
    );

    scoped.post("/kunden", async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const kuerzel = normalizeKuerzel((body.kuerzel as string | null | undefined) ?? null);
      if (kuerzel) {
        if (!isKuerzelFormatOk(kuerzel)) {
          reply.status(422);
          return { error: "kuerzel-format" };
        }
        const owner = findKuerzelOwner(kuerzel);
        if (owner) {
          reply.status(409);
          return { error: "kuerzel-belegt", kunde: owner };
        }
      }
      const k = createKunde({ ...body, kuerzel } as Parameters<typeof createKunde>[0]);
      audit({ userId: req.user?.id, action: "kunde.create", detail: { id: k.id, nummer: k.nummer }, ip: req.ip });
      return k;
    });

    scoped.patch<{ Params: { id: string } }>("/kunden/:id", async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if ("kuerzel" in body) {
        const k = normalizeKuerzel((body.kuerzel as string | null | undefined) ?? null);
        if (k) {
          if (!isKuerzelFormatOk(k)) {
            reply.status(422);
            return { error: "kuerzel-format" };
          }
          const owner = findKuerzelOwner(k, req.params.id);
          if (owner) {
            reply.status(409);
            return { error: "kuerzel-belegt", kunde: owner };
          }
        }
        body.kuerzel = k;
      }
      const result = updateKunde(req.params.id, body);
      if (!result) {
        reply.status(404);
        return { error: "not-found" };
      }
      audit({ userId: req.user?.id, action: "kunde.update", detail: { id: result.id }, ip: req.ip });
      return result;
    });

    scoped.delete<{ Params: { id: string } }>("/kunden/:id", async (req, reply) => {
      const mode = deleteKunde(req.params.id);
      if (mode === "missing") {
        reply.status(404);
        return { error: "not-found" };
      }
      audit({ userId: req.user?.id, action: "kunde.delete", detail: { id: req.params.id, mode }, ip: req.ip });
      return { ok: true, mode };
    });

    // ---------------- ANSPRECHPARTNER ----------------
    scoped.post("/ansprechpartner", async (req, reply) => {
      const schema = z.object({
        kundeId: z.string().min(1),
        anrede: z.string().optional(),
        vorname: z.string().optional(),
        nachname: z.string().optional(),
        position: z.string().optional(),
        abteilung: z.string().optional(),
        telefon: z.string().optional(),
        mobil: z.string().optional(),
        email: z.string().optional(),
        notiz: z.string().optional(),
        primaer: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        reply.status(422);
        return { error: "validation", detail: parsed.error.flatten() };
      }
      if (!getKunde(parsed.data.kundeId)) {
        reply.status(404);
        return { error: "kunde-not-found" };
      }
      const ap = createAnsprechpartner(parsed.data);
      audit({ userId: req.user?.id, action: "ansprechpartner.create", detail: { id: ap.id, kundeId: ap.kundeId }, ip: req.ip });
      return ap;
    });

    scoped.patch<{ Params: { id: string } }>("/ansprechpartner/:id", async (req, reply) => {
      const ap = updateAnsprechpartner(req.params.id, (req.body ?? {}) as Record<string, unknown>);
      if (!ap) {
        reply.status(404);
        return { error: "not-found" };
      }
      audit({ userId: req.user?.id, action: "ansprechpartner.update", detail: { id: ap.id }, ip: req.ip });
      return ap;
    });

    scoped.delete<{ Params: { id: string } }>("/ansprechpartner/:id", async (req, reply) => {
      const ok = deleteAnsprechpartner(req.params.id);
      if (!ok) {
        reply.status(404);
        return { error: "not-found" };
      }
      audit({ userId: req.user?.id, action: "ansprechpartner.delete", detail: { id: req.params.id }, ip: req.ip });
      reply.status(204);
    });

    // ---------------- OBJEKTE ----------------
    scoped.get("/objekte", async (req) => {
      const q = req.query as { kundeId?: string };
      return listObjekte(q.kundeId);
    });

    scoped.get<{ Params: { id: string } }>("/objekte/:id", async (req, reply) => {
      const o = getObjekt(req.params.id);
      if (!o) {
        reply.status(404);
        return { error: "not-found" };
      }
      return o;
    });

    scoped.post("/objekte", async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const schema = z.object({
        kundeId: z.string().min(1),
        name: z.string().min(1).max(255),
      }).passthrough();
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        reply.status(422);
        return { error: "validation", detail: parsed.error.flatten() };
      }
      if (!getKunde(parsed.data.kundeId)) {
        reply.status(404);
        return { error: "kunde-not-found" };
      }
      const o = createObjekt(parsed.data as unknown as Parameters<typeof createObjekt>[0]);
      audit({ userId: req.user?.id, action: "objekt.create", detail: { id: o.id, nummer: o.nummer }, ip: req.ip });
      return o;
    });

    scoped.patch<{ Params: { id: string } }>("/objekte/:id", async (req, reply) => {
      const o = updateObjekt(req.params.id, (req.body ?? {}) as Record<string, unknown>);
      if (!o) {
        reply.status(404);
        return { error: "not-found" };
      }
      audit({ userId: req.user?.id, action: "objekt.update", detail: { id: o.id }, ip: req.ip });
      return o;
    });

    scoped.delete<{ Params: { id: string } }>("/objekte/:id", async (req, reply) => {
      const mode = deleteObjekt(req.params.id);
      if (mode === "missing") {
        reply.status(404);
        return { error: "not-found" };
      }
      audit({ userId: req.user?.id, action: "objekt.delete", detail: { id: req.params.id, mode }, ip: req.ip });
      return { ok: true, mode };
    });

    // ---------------- NOTIZEN ----------------
    scoped.post("/notizen", async (req, reply) => {
      const schema = z.object({
        kundeId: z.string().min(1).optional(),
        objektId: z.string().min(1).optional(),
        angebotId: z.string().min(1).optional(),
        rechnungId: z.string().min(1).optional(),
        text: z.string().min(1).max(10000),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        reply.status(422);
        return { error: "validation", detail: parsed.error.flatten() };
      }
      try {
        const n = createNotiz({ ...parsed.data, autorId: req.user?.id });
        audit({ userId: req.user?.id, action: "notiz.create", detail: { id: n.id }, ip: req.ip });
        return n;
      } catch (e) {
        reply.status(422);
        return { error: (e as Error).message };
      }
    });

    scoped.delete<{ Params: { id: string } }>("/notizen/:id", async (req, reply) => {
      const ok = deleteNotiz(req.params.id);
      if (!ok) {
        reply.status(404);
        return { error: "not-found" };
      }
      audit({ userId: req.user?.id, action: "notiz.delete", detail: { id: req.params.id }, ip: req.ip });
      reply.status(204);
    });

    // ---------------- SUCHE ----------------
    scoped.get("/search", async (req) => {
      const q = (req.query as { q?: string }).q ?? "";
      return suche(q);
    });
  });
}
