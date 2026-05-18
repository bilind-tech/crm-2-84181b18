// Routen für Mahn-Automatik.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { audit } from "../auth/audit.js";
import {
  ladeMahnEinstellungen,
  runMahnAutomatik,
  versendeMahnungJetzt,
} from "../mahnung/automatik.js";
import {
  getLauf,
  letzterLauf,
  listEintraege,
  listLaeufe,
} from "../mahnung/repo.js";
import { getRechnung } from "../belege/rechnungen-repo.js";
import { bestimmeMahnZustand } from "../mahnung/regeln.js";

export async function mahnungRoutes(app: FastifyInstance): Promise<void> {
  app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);

    scoped.get("/mahnung/status", async () => {
      const cfg = ladeMahnEinstellungen();
      return { einstellungen: cfg, letzterLauf: letzterLauf() };
    });

    scoped.get("/mahnung/laeufe", async () => listLaeufe(30));

    scoped.get<{ Params: { id: string } }>("/mahnung/laeufe/:id", async (req, reply) => {
      const lauf = getLauf(req.params.id);
      if (!lauf) return reply.code(404).send({ error: "not-found" });
      return { ...lauf, eintraege: listEintraege(lauf.id) };
    });

    scoped.post("/mahnung/jetzt-pruefen", async (req) => {
      const body = z
        .object({ modus: z.enum(["aus", "vorschlag", "auto"]).optional() })
        .parse(req.body ?? {});
      const res = runMahnAutomatik({ quelle: "manuell", modusOverride: body.modus });
      audit({ userId: req.user?.id, action: "mahnung.lauf.manuell", detail: res, ip: req.ip });
      return res;
    });

    scoped.post<{ Params: { id: string } }>(
      "/rechnungen/:id/mahnung-versenden",
      async (req, reply) => {
        const body = z
          .object({ stufe: z.union([z.literal(1), z.literal(2), z.literal(3)]) })
          .safeParse(req.body ?? {});
        if (!body.success) {
          return reply.code(400).send({ error: "validation", issues: body.error.issues });
        }
        const r = getRechnung(req.params.id);
        if (!r) return reply.code(404).send({ error: "not-found" });
        const cfg = ladeMahnEinstellungen();
        const config = cfg.stufen.find((c) => c.stufe === body.data.stufe);
        if (!config) return reply.code(400).send({ error: "stufe-unbekannt" });
        // Sanity: Empfehlung anzeigen, aber nicht blockieren (manueller Versand erlaubt jede Stufe).
        bestimmeMahnZustand(r, cfg);
        const res = versendeMahnungJetzt({
          rechnungId: r.id,
          stufe: body.data.stufe,
          config,
          heute: new Date().toISOString().slice(0, 10),
        });
        if (!res.ok) return reply.code(400).send({ error: res.grund });
        audit({
          userId: req.user?.id,
          action: "mahnung.versendet.manuell",
          detail: { id: r.id, stufe: body.data.stufe },
          ip: req.ip,
        });
        return { ok: true, emailVersandId: res.emailVersandId };
      },
    );
  });
}
