// /email/* — Vorlagen, Signaturen, Versand-Queue, Test.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth } from "../auth/middleware.js";
import { audit } from "../auth/audit.js";
import {
  listVorlagen, getVorlage, createVorlage, updateVorlage, deleteVorlage,
  listSignaturen, getSignatur, createSignatur, updateSignatur, deleteSignatur,
  type EmailKontext,
} from "../email/templates.js";
import {
  enqueueVersand, getById, listVersand, abbrechen,
  type EmailVersandStatus,
} from "../email/versand-repo.js";
import { sendNow, translateSmtpError } from "../email/worker.js";
import { getTransport, getFromAddress, loadSmtpRuntime, verifyTransport } from "../email/transport.js";

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
// Adapter-Schema: nimmt sowohl die UI-Schreibweise (`empfaenger[]`, `koerperHtml`,
// `belegTyp`, `mahnStufe`) als auch das Repo-interne Schema entgegen. Genau ein
// Eintrag aus jedem Paar muss gesetzt sein. `idempotenzKey` ist optional und
// wird sonst deterministisch aus Empfänger+Betreff+Beleg gehasht (verhindert
// Doppelklick-Sends auch ohne Mitarbeit der UI).
const VersandSchema = z.object({
  // Empfänger
  empfaengerTo: z.string().trim().email().max(320).optional(),
  empfaenger: z.array(z.string().trim().email().max(320)).max(50).optional(),
  empfaengerCc: z.string().trim().max(2000).optional(),
  cc: z.array(z.string().trim().email().max(320)).max(50).optional(),
  empfaengerBcc: z.string().trim().max(2000).optional(),
  bcc: z.array(z.string().trim().email().max(320)).max(50).optional(),
  // Inhalt
  betreff: z.string().trim().min(1).max(500),
  bodyHtml: z.string().max(100_000).optional(),
  koerperHtml: z.string().max(100_000).optional(),
  // Beleg
  belegArt: z.enum(["angebot", "rechnung"]).optional(),
  belegTyp: z.enum(["angebot", "rechnung", "allgemein"]).optional(),
  belegId: z.string().max(64).optional(),
  kundeId: z.string().max(64).optional(),
  vorlageId: z.string().max(64).optional(),
  signaturId: z.string().max(64).optional(),
  mahnStufe: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  // Anhänge: Frontend-Hinweis, hier nur tolerant ignoriert (PDF wird im sendNow gerendert).
  anhaenge: z.array(z.unknown()).optional(),
  idempotenzKey: z.string().min(1).max(200).optional(),
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

      // ---- Normalisierung: UI-Aliasse -> Repo-Schema ----
      const d = p.data;
      const toList = d.empfaenger ?? (d.empfaengerTo ? [d.empfaengerTo] : []);
      if (toList.length === 0) {
        reply.status(422); return { error: "validation", hint: "Empfänger fehlt." };
      }
      const empfaengerTo = toList.join(", ");
      const empfaengerCc = d.cc?.length ? d.cc.join(", ") : (d.empfaengerCc || undefined);
      const empfaengerBcc = d.bcc?.length ? d.bcc.join(", ") : (d.empfaengerBcc || undefined);
      const bodyHtml = d.bodyHtml ?? d.koerperHtml ?? "";
      if (!bodyHtml) { reply.status(422); return { error: "validation", hint: "Body fehlt." }; }
      const belegArt: "angebot" | "rechnung" | undefined =
        d.belegArt ?? (d.belegTyp === "angebot" || d.belegTyp === "rechnung" ? d.belegTyp : undefined);

      // Idempotenz: explizit oder deterministisch aus Inhalt gehasht.
      const idempotenzKey = d.idempotenzKey ?? (() => {
        const h = crypto.createHash("sha256");
        h.update([belegArt ?? "", d.belegId ?? "", empfaengerTo, d.betreff].join("|"));
        return `auto-${h.digest("hex").slice(0, 32)}`;
      })();

      // Anti-Flood: globaler Token-Bucket + per-Idempotenz-Key Cooldown.
      if (!sendBudget.tryTake()) {
        reply.status(429);
        return { error: "rate-limit", hint: "Maximal 30 E-Mails pro Minute." };
      }
      if (!keyCooldown.tryTake(idempotenzKey)) {
        reply.status(429);
        return { error: "rate-limit", hint: "Bitte kurz warten — gleicher Versand wurde gerade ausgelöst." };
      }

      // Idempotenz-Eintrag (oder bestehende Zeile) holen.
      let row, created;
      try {
        ({ row, created } = enqueueVersand({
          empfaengerTo, empfaengerCc, empfaengerBcc,
          betreff: d.betreff, bodyHtml,
          belegArt, belegId: d.belegId,
          vorlageId: d.vorlageId, signaturId: d.signaturId,
          mahnStufe: d.mahnStufe,
          idempotenzKey,
          quelle: "manuell",
        }));
      } catch (e) {
        // Verstoß gegen Manual-Only-Garantie wäre der einzige Pfad hierhin.
        audit({ userId: req.user?.id, action: "email.send.blocked", ip: req.ip, detail: { error: (e as Error).message } });
        reply.status(403);
        return { error: "auto-mail-blockiert", hint: (e as Error).message };
      }

      // Bereits gesendet? Dann existierende Zeile zurückgeben (Doppelklick-Schutz).
      if (!created && (row.status === "gesendet" || row.status === "sending")) {
        reply.status(200);
        return row;
      }

      // SYNCHRON senden — der User wartet auf das Ergebnis. Kein Hintergrund-Worker.
      const result = await sendNow(row);
      const after = getById(row.id);

      // Audit-Trail: Pflicht. Jede Mail ist nachweisbar User-getriggert.
      audit({
        userId: req.user?.id,
        ip: req.ip,
        action: result.ok ? "email.send" : "email.send.fehler",
        detail: {
          quelle: "manuell",
          versandId: row.id,
          belegArt: belegArt ?? null,
          belegId: d.belegId ?? null,
          mahnStufe: d.mahnStufe ?? null,
          an: toList,
          messageId: result.messageId ?? null,
          errorCode: result.ok ? null : result.errorCode ?? null,
        },
      });

      reply.status(result.ok ? 201 : 502);
      return {
        ...(after ?? row),
        sendOk: result.ok,
        sendError: result.ok ? undefined : result.error,
        sendErrorCode: result.ok ? undefined : result.errorCode,
      };
    });
    scoped.post<{ Params: { id: string } }>("/email/versand/:id/retry", async (req, reply) => {
      const existing = getById(req.params.id);
      if (!existing) { reply.status(404); return { error: "not-found" }; }
      if (existing.status === "gesendet") return existing;
      if (!sendBudget.tryTake()) {
        reply.status(429);
        return { error: "rate-limit" };
      }
      const result = await sendNow(existing);
      const after = getById(existing.id);
      reply.status(result.ok ? 200 : 502);
      return {
        ...(after ?? existing),
        sendOk: result.ok,
        sendError: result.ok ? undefined : result.error,
        sendErrorCode: result.ok ? undefined : result.errorCode,
      };
    });
    scoped.post<{ Params: { id: string } }>("/email/versand/:id/abbrechen", async (req, reply) => {
      if (!abbrechen(req.params.id)) { reply.status(404); return { error: "not-found" }; }
      return getById(req.params.id);
    });

    // ---- Verbindungstest (kein Versand!) ----
    scoped.post("/email/verify", async () => {
      if (!loadSmtpRuntime()) return { ok: false, error: "SMTP nicht konfiguriert", errorCode: "NOT_CONFIGURED" };
      try {
        const r = await verifyTransport();
        return { ok: true, latencyMs: r.latencyMs };
      } catch (e) {
        const err = e as { code?: string; message?: string };
        return {
          ok: false,
          errorCode: err.code ?? "UNKNOWN",
          error: translateSmtpError(err.code ?? "UNKNOWN", err.message ?? String(e)),
        };
      }
    });

    // ---- Echter Test-Versand (genau eine Mail an die eingegebene Adresse) ----
    scoped.post("/email/test", async (req, reply) => {
      const p = z.object({ an: z.string().trim().email() }).safeParse(req.body);
      if (!p.success) { reply.status(422); return { error: "validation" }; }
      if (!loadSmtpRuntime()) { reply.status(400); return { error: "smtp-nicht-konfiguriert" }; }
      if (!sendBudget.tryTake()) { reply.status(429); return { error: "rate-limit" }; }
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
        const err = e as { code?: string; message?: string };
        reply.status(502);
        return {
          ok: false,
          errorCode: err.code ?? "UNKNOWN",
          error: translateSmtpError(err.code ?? "UNKNOWN", err.message ?? String(e)),
        };
      }
    });
  });
}

// --- Anti-Flood: einfache In-Memory-Buckets, prozesslokal. ---
class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(private capacity: number, private refillPerMs: number) {
    this.tokens = capacity;
    this.last = Date.now();
  }
  tryTake(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) * this.refillPerMs);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
class KeyCooldown {
  private map = new Map<string, number>();
  private lastSweep = 0;
  constructor(private cooldownMs: number) {}
  tryTake(key: string): boolean {
    const now = Date.now();
    // billiger periodischer Sweep — höchstens 1× pro Minute.
    if (now - this.lastSweep > 60_000) {
      for (const [k, t] of this.map) if (now - t > Math.max(this.cooldownMs * 4, 60_000)) this.map.delete(k);
      this.lastSweep = now;
    }
    const last = this.map.get(key) ?? 0;
    if (now - last < this.cooldownMs) return false;
    this.map.set(key, now);
    return true;
  }
}
// 30 Mails / Minute global, 5 s Cooldown pro idempotenzKey.
const sendBudget = new TokenBucket(30, 30 / 60_000);
const keyCooldown = new KeyCooldown(5_000);
