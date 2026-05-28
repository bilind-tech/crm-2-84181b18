// Step 4: REST-Endpoints für Angebote, Rechnungen und Zahlungen.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { audit } from "../auth/audit.js";
import {
  createAngebot,
  deleteAngebot,
  duplicateAngebot,
  getAngebot,
  listAngebote,
  sendeAngebot,
  updateAngebot,
} from "../belege/angebote-repo.js";
import {
  createRechnung,
  deleteRechnung,
  getRechnung,
  listRechnungen,
  markiereInkasso,
  pausiereMahnung,
  sendeRechnung,
  updateRechnung,
} from "../belege/rechnungen-repo.js";
import { addZahlung, deleteZahlung } from "../belege/zahlungen.js";
import { angebotInRechnungUmwandeln } from "../belege/umwandeln.js";
import { getKunde } from "../kunden/repo.js";
import { legeDauerauftragAusRechnungAn } from "../dauerauftrag/generator.js";

const positionSchema = z.object({
  id: z.string().optional(),
  beschreibung: z.string().max(2000).optional(),
  menge: z.number().optional(),
  einheit: z.string().max(20).optional(),
  einzelpreisNetto: z.number().optional(),
  steuersatz: z.number().min(0).max(100).optional(),
  rabatt: z.number().min(0).max(100).optional(),
  modus: z.enum(["einzel", "pauschal", "stunden"]).optional(),
  pauschalpreisNetto: z.number().optional(),
  // ausfuehrung: deprecated — wird vom Frontend nicht mehr gesetzt.
  // Im DTO weiterhin akzeptiert (Bestands-Clients), aber im Repo auf null gemappt.
  ausfuehrung: z.string().max(200).optional(),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function belegeRoutes(app: FastifyInstance): Promise<void> {
  app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);

    // ============================================================
    // ANGEBOTE
    // ============================================================
    scoped.get("/angebote", async (req) => {
      const q = req.query as Record<string, string | undefined>;
      return listAngebote({
        kundeId: q.kundeId,
        status: q.status,
        archiviert: q.archiviert === "true" ? true : q.archiviert === "false" ? false : undefined,
        q: q.q,
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      });
    });

    scoped.get<{ Params: { id: string } }>("/angebote/:id", async (req, reply) => {
      const a = getAngebot(req.params.id);
      if (!a) {
        reply.status(404);
        return { error: "not-found" };
      }
      return a;
    });

    scoped.post("/angebote", async (req, reply) => {
      const schema = z.object({
        kundeId: z.string().min(1),
        objektId: z.string().nullish(),
        ansprechpartnerId: z.string().nullish(),
        titel: z.string().max(500).optional(),
        introText: z.string().max(10000).optional(),
        outroText: z.string().max(10000).optional(),
        positionen: z.array(positionSchema).max(500).optional(),
        rabattGesamt: z.number().min(0).max(100).optional(),
        steuersatz: z.number().min(0).max(100).optional(),
        gueltigBis: z.string().optional(),
        einsatzVon: isoDate.nullish(),
        einsatzBis: isoDate.nullish(),
        notizen: z.string().max(10000).optional(),
        optionen: z.unknown().optional(),
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
      const a = createAngebot(parsed.data);
      audit({ userId: req.user?.id, action: "angebot.create", detail: { id: a.id, nummer: a.nummer }, ip: req.ip });
      return a;
    });

    scoped.patch<{ Params: { id: string } }>("/angebote/:id", async (req, reply) => {
      const a = updateAngebot(req.params.id, (req.body ?? {}) as Record<string, unknown>);
      if (!a) {
        reply.status(404);
        return { error: "not-found" };
      }
      audit({ userId: req.user?.id, action: "angebot.update", detail: { id: a.id }, ip: req.ip });
      return a;
    });

    scoped.delete<{ Params: { id: string } }>("/angebote/:id", async (req, reply) => {
      const r = deleteAngebot(req.params.id);
      if (r === "missing") {
        reply.status(404);
        return { error: "not-found" };
      }
      audit({ userId: req.user?.id, action: "angebot.delete", detail: { id: req.params.id }, ip: req.ip });
      return { ok: true };
    });

    scoped.post<{ Params: { id: string } }>("/angebote/:id/senden", async (req, reply) => {
      const a = sendeAngebot(req.params.id);
      if (!a) {
        reply.status(404);
        return { error: "not-found" };
      }
      audit({ userId: req.user?.id, action: "angebot.senden", detail: { id: a.id }, ip: req.ip });
      return a;
    });

    scoped.post<{ Params: { id: string } }>("/angebote/:id/in-rechnung-umwandeln", async (req, reply) => {
      const r = angebotInRechnungUmwandeln(req.params.id);
      if (!r) {
        reply.status(404);
        return { error: "not-found" };
      }
      audit({
        userId: req.user?.id,
        action: "angebot.in-rechnung",
        detail: { angebotId: req.params.id, rechnungId: r.id },
        ip: req.ip,
      });
      return r;
    });

    scoped.post<{ Params: { id: string } }>("/angebote/:id/duplizieren", async (req, reply) => {
      const a = duplicateAngebot(req.params.id);
      if (!a) {
        reply.status(404);
        return { error: "not-found" };
      }
      audit({ userId: req.user?.id, action: "angebot.duplizieren", detail: { quellId: req.params.id, neuId: a.id }, ip: req.ip });
      return a;
    });

    // ============================================================
    // RECHNUNGEN
    // ============================================================
    scoped.get("/rechnungen", async (req) => {
      const q = req.query as Record<string, string | undefined>;
      return listRechnungen({
        kundeId: q.kundeId,
        status: q.status,
        archiviert: q.archiviert === "true" ? true : q.archiviert === "false" ? false : undefined,
        q: q.q,
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      });
    });

    scoped.get<{ Params: { id: string } }>("/rechnungen/:id", async (req, reply) => {
      const r = getRechnung(req.params.id);
      if (!r) {
        reply.status(404);
        return { error: "not-found" };
      }
      return r;
    });

    scoped.post("/rechnungen", async (req, reply) => {
      const schema = z.object({
        kundeId: z.string().min(1),
        objektId: z.string().nullish(),
        ansprechpartnerId: z.string().nullish(),
        quellAngebotId: z.string().nullish(),
        titel: z.string().max(500).optional(),
        introText: z.string().max(10000).optional(),
        outroText: z.string().max(10000).optional(),
        positionen: z.array(positionSchema).max(500).optional(),
        rabattGesamt: z.number().min(0).max(100).optional(),
        steuersatz: z.number().min(0).max(100).optional(),
        rechnungsdatum: z.string().optional(),
        faelligkeitsdatum: z.string().optional(),
        leistungsmonat: z.string().regex(/^\d{4}-\d{2}$/).nullish(),
        einsatzVon: isoDate.nullish(),
        einsatzBis: isoDate.nullish(),
        notizen: z.string().max(10000).optional(),
        optionen: z.unknown().optional(),
        vertragId: z.string().min(1).nullish(),
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
      let r;
      try {
        r = createRechnung(parsed.data);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "create-failed";
        if (msg === "vertrag-falscher-kunde") {
          reply.status(422);
          return { error: "vertrag-falscher-kunde" };
        }
        throw e;
      }

      // Auto-Anlage: Wenn als wiederkehrend markiert und (noch) kein DA verknüpft,
      // direkt einen Dauerauftrag aus dieser Rechnung ableiten.
      const opt = (parsed.data.optionen ?? {}) as {
        wiederkehrend?: boolean;
        wiederkehrendDetails?: { rhythmus?: string };
      };
      let dauerauftragNeu: { id: string; nummer: string } | undefined;
      if (opt.wiederkehrend === true && !r.dauerauftragId) {
        const rh = opt.wiederkehrendDetails?.rhythmus;
        const frequenz =
          rh === "quartalsweise" || rh === "jaehrlich" || rh === "halbjaehrlich"
            ? rh
            : "monatlich";
        const neu = legeDauerauftragAusRechnungAn({
          rechnungId: r.id,
          kundeId: r.kundeId,
          rechnungsdatum: r.rechnungsdatum,
          bezeichnung: r.titel || "Dauerauftrag",
          positionen: r.positionen,
          rabattGesamt: r.rabattGesamt,
          steuersatz: r.steuersatz,
          frequenz: frequenz as "monatlich" | "quartalsweise" | "halbjaehrlich" | "jaehrlich",
          introText: r.introText,
          outroText: r.outroText,
          objektId: r.objektId ?? null,
          ansprechpartnerId: r.ansprechpartnerId ?? null,
        });
        if (neu) {
          dauerauftragNeu = neu;
          (r as { dauerauftragId?: string }).dauerauftragId = neu.id;
        }
      }

      audit({ userId: req.user?.id, action: "rechnung.create", detail: { id: r.id, nummer: r.nummer }, ip: req.ip });
      return dauerauftragNeu ? { ...r, dauerauftragNeu } : r;
    });

    scoped.patch<{ Params: { id: string } }>("/rechnungen/:id", async (req, reply) => {
      let r;
      try {
        r = updateRechnung(req.params.id, (req.body ?? {}) as Record<string, unknown>);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "update-failed";
        if (msg === "vertrag-falscher-kunde" || msg === "vertrag-not-found") {
          reply.status(422);
          return { error: msg };
        }
        throw e;
      }
      if (!r) {
        reply.status(404);
        return { error: "not-found" };
      }
      audit({ userId: req.user?.id, action: "rechnung.update", detail: { id: r.id }, ip: req.ip });
      return r;
    });

    scoped.delete<{ Params: { id: string } }>("/rechnungen/:id", async (req, reply) => {
      const r = deleteRechnung(req.params.id);
      if (r === "missing") {
        reply.status(404);
        return { error: "not-found" };
      }
      audit({ userId: req.user?.id, action: "rechnung.delete", detail: { id: req.params.id }, ip: req.ip });
      return { ok: true };
    });

    scoped.post<{ Params: { id: string } }>("/rechnungen/:id/senden", async (req, reply) => {
      const r = sendeRechnung(req.params.id);
      if (!r) {
        reply.status(404);
        return { error: "not-found" };
      }
      audit({ userId: req.user?.id, action: "rechnung.senden", detail: { id: r.id }, ip: req.ip });
      return r;
    });

    // ---- Zahlungen ----
    scoped.post<{ Params: { id: string } }>("/rechnungen/:id/zahlungen", async (req, reply) => {
      const schema = z.object({
        datum: z.string().optional(),
        betrag: z.number().positive(),
        methode: z.string().optional(),
        referenz: z.string().max(200).optional(),
        notiz: z.string().max(2000).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        reply.status(422);
        return { error: "validation", detail: parsed.error.flatten() };
      }
      try {
        const z = addZahlung(req.params.id, parsed.data);
        if (!z) {
          reply.status(404);
          return { error: "rechnung-not-found" };
        }
        audit({ userId: req.user?.id, action: "rechnung.zahlung.add", detail: { rechnungId: req.params.id, zahlungId: z.id }, ip: req.ip });
        return z;
      } catch (e) {
        reply.status(422);
        return { error: (e as Error).message };
      }
    });

    scoped.delete<{ Params: { rechnungId: string; zahlungId: string } }>(
      "/rechnungen/:rechnungId/zahlungen/:zahlungId",
      async (req, reply) => {
        const ok = deleteZahlung(req.params.rechnungId, req.params.zahlungId);
        if (!ok) {
          reply.status(404);
          return { error: "not-found" };
        }
        audit({
          userId: req.user?.id,
          action: "rechnung.zahlung.delete",
          detail: { rechnungId: req.params.rechnungId, zahlungId: req.params.zahlungId },
          ip: req.ip,
        });
        reply.status(204);
      },
    );

    // ---- Mahnung pausieren / Inkasso ----
    scoped.post<{ Params: { id: string } }>("/rechnungen/:id/mahnung-pausieren", async (req, reply) => {
      const schema = z.object({ bis: z.string().min(1) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        reply.status(422);
        return { error: "validation", detail: parsed.error.flatten() };
      }
      const r = pausiereMahnung(req.params.id, parsed.data.bis);
      if (!r) {
        reply.status(404);
        return { error: "not-found" };
      }
      audit({ userId: req.user?.id, action: "rechnung.mahnung.pause", detail: { id: r.id, bis: parsed.data.bis }, ip: req.ip });
      return r;
    });

    scoped.post<{ Params: { id: string } }>("/rechnungen/:id/inkasso-markieren", async (req, reply) => {
      const r = markiereInkasso(req.params.id);
      if (!r) {
        reply.status(404);
        return { error: "not-found" };
      }
      audit({ userId: req.user?.id, action: "rechnung.inkasso", detail: { id: r.id }, ip: req.ip });
      return r;
    });

    // ============================================================
    // BELEGNUMMERN — Reservierung & Import-Scan
    // ============================================================
    const reserviereSchema = z.object({
      art: z.enum(["angebot", "rechnung"]),
      nummer: z.string().min(3).max(40),
      kundeId: z.string().optional(),
      grund: z.string().max(200).optional(),
    });
    scoped.post("/belege/nummer/reservieren", async (req, reply) => {
      const parsed = reserviereSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        reply.status(422);
        return { error: "invalid-input" };
      }
      const { reserviereNummer } = await import("../belege/belegnummer.js");
      const r = reserviereNummer(parsed.data);
      if (!r.ok) {
        reply.status(r.grund === "kollision" ? 409 : 422);
        return { error: r.grund };
      }
      audit({ userId: req.user?.id, action: "belegnummer.reservieren", detail: parsed.data, ip: req.ip });
      return { ok: true };
    });

    scoped.post("/belege/nummer/import-scan", async (req) => {
      const { importScanZaehler } = await import("../belege/belegnummer.js");
      const result = importScanZaehler();
      audit({ userId: req.user?.id, action: "belegnummer.import-scan", detail: result, ip: req.ip });
      return result;
    });
  });
}
