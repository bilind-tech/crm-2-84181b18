// /einstellungen/* — alle hinter requireAuth.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  AREAS,
  SENSITIVE_KEYS,
  SmtpPasswordSchema,
} from "../settings/schemas.js";
import {
  deleteSetting,
  getSetting,
  getSettingMeta,
  setSetting,
} from "../settings/store.js";
import { requireAuth } from "../auth/middleware.js";
import { audit } from "../auth/audit.js";
import { emit } from "../events/bus.js";
import { createConnection } from "node:net";
import { resetTransport } from "../email/transport.js";
import { resetImapClient } from "../email/imap-archive.js";
import { flachZuUi, uiPatchZuFlach } from "../mahnung/settings-adapter.js";
import { MahnungSchema } from "../settings/schemas.js";

function loadArea(name: keyof typeof AREAS): unknown {
  const a = AREAS[name];
  const stored = getSetting(a.key);
  return a.schema.parse(stored ?? {});
}

/**
 * Patch-Semantik:
 * 1. Body gegen Partial-Schema validieren (nur gesetzte Felder).
 * 2. Mit aktuellem Stand mergen.
 * 3. Gegen Vollschema validieren (Defaults bleiben für ungesetzte Felder erhalten).
 * Leere Strings werden als gewollte Werte beibehalten (kein silent revert).
 */
function patchArea(
  name: keyof typeof AREAS,
  body: unknown,
):
  | { ok: true; value: unknown }
  | { ok: false; status: number; error: string; issues?: unknown } {
  const a = AREAS[name];
  // Partial-Validierung: nur Felder die der Client schickt
  const partialSchema =
    "partial" in a.schema && typeof (a.schema as { partial: () => unknown }).partial === "function"
      ? ((a.schema as unknown as { partial: () => z.ZodTypeAny }).partial())
      : a.schema;
  const partial = partialSchema.safeParse(body ?? {});
  if (!partial.success) {
    return { ok: false, status: 422, error: "validation", issues: partial.error.issues };
  }
  const current = a.schema.parse(getSetting(a.key) ?? {}) as Record<string, unknown>;
  const merged = { ...current, ...(partial.data as Record<string, unknown>) };
  const parsed = a.schema.safeParse(merged);
  if (!parsed.success) {
    return { ok: false, status: 422, error: "validation", issues: parsed.error.issues };
  }
  setSetting(a.key, parsed.data, { encrypt: a.encrypted });
  return { ok: true, value: parsed.data };
}

export async function einstellungenRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  const simpleAreas: Array<keyof typeof AREAS> = [
    "nummernkreise",
    "sicherheit",
    "erscheinung",
    "backup",
    // "mahnung" wird unten mit eigenem Mapper bedient
    "dauerauftrag",
    "steuer",
    "stundenzettel",
  ];
  for (const a of simpleAreas) {
    app.get(`/einstellungen/${a}`, async () => loadArea(a));
    app.patch(`/einstellungen/${a}`, async (req, reply) => {
      const r = patchArea(a, req.body);
      if (!r.ok) {
        reply.status(r.status);
        return { error: r.error, issues: r.issues };
      }
      audit({ userId: req.user?.id, action: `settings.${a}.patch`, ip: req.ip });
      emit("einstellung:geaendert", { key: a, userId: req.user?.id ?? null });
      return r.value;
    });
  }

  // -------- Firma — UI nutzt firmenname/webseite, Backend speichert name/web --------
  // Adapter akzeptiert beide Schreibweisen und liefert beide zurück, damit weder
  // Formular noch PDF-Renderer leere Felder sehen.
  function firmaToWire(base: Record<string, unknown>): Record<string, unknown> {
    const b = base;
    // Legacy-Korrektur: alter Default-Schreibung ohne Leerzeichen wird
    // nur bei exakter Übereinstimmung in „My Clean Center GmbH" überführt.
    let name = b.name;
    if (typeof name === "string" && name.trim() === "MyCleanCenter GmbH") {
      name = "My Clean Center GmbH";
    }
    return {
      ...b,
      name,
      // UI-Aliasse zusätzlich zu den internen Feldern:
      firmenname: name,
      webseite: b.web,
    };
  }
  function firmaFromWire(input: Record<string, unknown>): Record<string, unknown> {
    const i = { ...input };
    if (i.firmenname !== undefined && i.name === undefined) i.name = i.firmenname;
    if (i.webseite !== undefined && i.web === undefined) i.web = i.webseite;
    delete i.firmenname;
    delete i.webseite;
    return i;
  }

  app.get("/einstellungen/firma", async () => {
    const base = loadArea("firma") as Record<string, unknown>;
    return firmaToWire(base);
  });
  app.patch("/einstellungen/firma", async (req, reply) => {
    const mapped = firmaFromWire((req.body ?? {}) as Record<string, unknown>);
    const r = patchArea("firma", mapped);
    if (!r.ok) {
      reply.status(r.status);
      return { error: r.error, issues: r.issues };
    }
    audit({ userId: req.user?.id, action: "settings.firma.patch", ip: req.ip });
    emit("einstellung:geaendert", { key: "firma", userId: req.user?.id ?? null });
    return firmaToWire(r.value as Record<string, unknown>);
  });

  // -------- Mahnung — flach intern, nested für UI --------
  app.get("/einstellungen/mahnung", async () => {
    const flach = MahnungSchema.parse(getSetting("mahnung") ?? {});
    return flachZuUi(flach);
  });
  app.patch("/einstellungen/mahnung", async (req, reply) => {
    const patch = uiPatchZuFlach((req.body ?? {}) as Record<string, unknown>);
    const r = patchArea("mahnung", patch);
    if (!r.ok) {
      reply.status(r.status);
      return { error: r.error, issues: r.issues };
    }
    audit({ userId: req.user?.id, action: "settings.mahnung.patch", ip: req.ip });
    emit("einstellung:geaendert", { key: "mahnung", userId: req.user?.id ?? null });
    return flachZuUi(r.value as z.infer<typeof MahnungSchema>);
  });

  // SMTP — akzeptiert UI-Aliasse (server/ssl/benutzer/absenderName/absenderEmail/passwort)
  // UND die internen Felder (host/secure/user/fromName/fromEmail/password).
  // Liefert beide Schreibweisen zurück, damit jede Konsumentin glücklich ist.
  function smtpToWire(base: Record<string, unknown>, meta: { exists: boolean; updatedAt?: string | null }) {
    const b = base as Record<string, unknown>;
    return {
      host: b.host, port: b.port, secure: b.secure, user: b.user,
      fromName: b.fromName, fromEmail: b.fromEmail,
      // UI-Aliasse:
      server: b.host, ssl: b.secure, benutzer: b.user,
      absenderName: b.fromName, absenderEmail: b.fromEmail,
      passwordIsSet: meta.exists,
      passwortGesetzt: meta.exists,
      passwordUpdatedAt: meta.updatedAt ?? null,
    };
  }
  function smtpFromWire(input: Record<string, unknown>): { core: Record<string, unknown>; password?: string } {
    const i = input;
    const pw = typeof i.password === "string" && i.password.length > 0
      ? (i.password as string)
      : typeof i.passwort === "string" && (i.passwort as string).length > 0
        ? (i.passwort as string)
        : undefined;
    const core: Record<string, unknown> = {};
    if ("host" in i) core.host = i.host;
    else if ("server" in i) core.host = i.server;
    if ("port" in i) core.port = i.port;
    if ("secure" in i) core.secure = i.secure;
    else if ("ssl" in i) core.secure = i.ssl;
    if ("user" in i) core.user = i.user;
    else if ("benutzer" in i) core.user = i.benutzer;
    if ("fromName" in i) core.fromName = i.fromName;
    else if ("absenderName" in i) core.fromName = i.absenderName;
    if ("fromEmail" in i) core.fromEmail = i.fromEmail;
    else if ("absenderEmail" in i) core.fromEmail = i.absenderEmail;
    return { core, password: pw };
  }

  app.get("/einstellungen/smtp", async () => {
    const base = loadArea("smtp") as Record<string, unknown>;
    const meta = getSettingMeta(SENSITIVE_KEYS.smtpPassword);
    return smtpToWire(base, meta);
  });
  app.patch("/einstellungen/smtp", async (req, reply) => {
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const { core, password } = smtpFromWire(raw);
    if (password) {
      const pw = SmtpPasswordSchema.safeParse({ password });
      if (!pw.success) {
        reply.status(422);
        return { error: "validation", issues: pw.error.issues };
      }
      setSetting(SENSITIVE_KEYS.smtpPassword, pw.data.password, { encrypt: true });
      resetTransport();
      resetImapClient();
    }
    const r = patchArea("smtp", core);
    if (!r.ok) {
      reply.status(r.status);
      return { error: r.error, issues: r.issues };
    }
    resetTransport();
    resetImapClient();
    audit({ userId: req.user?.id, action: "settings.smtp.patch", ip: req.ip });
    emit("einstellung:geaendert", { key: "smtp", userId: req.user?.id ?? null });
    const meta = getSettingMeta(SENSITIVE_KEYS.smtpPassword);
    return smtpToWire(r.value as Record<string, unknown>, meta);
  });
  app.delete("/einstellungen/smtp/passwort", async (req) => {
    deleteSetting(SENSITIVE_KEYS.smtpPassword);
    resetTransport();
    resetImapClient();
    audit({ userId: req.user?.id, action: "settings.smtp.password-clear", ip: req.ip });
    return { ok: true };
  });
  // Reiner TCP-Reachability-Check (alt). Echte Auth/TLS-Prüfung -> POST /email/verify.
  app.post("/einstellungen/smtp/test", async () => {
    const cfg = loadArea("smtp") as { host: string; port: number };
    if (!cfg.host) return { ok: false, erfolg: false, nachricht: "Host fehlt" };
    return await new Promise<{ ok: boolean; erfolg: boolean; nachricht: string; latencyMs?: number }>((resolve) => {
      const t0 = Date.now();
      const sock = createConnection({ host: cfg.host, port: cfg.port, timeout: 4000 });
      const done = (res: { ok: boolean; nachricht: string; latencyMs?: number }): void => {
        try { sock.destroy(); } catch { /* ignore */ }
        resolve({ ...res, erfolg: res.ok });
      };
      sock.once("connect", () => done({ ok: true, latencyMs: Date.now() - t0, nachricht: `Server erreichbar (${Date.now() - t0} ms) — für Auth/TLS bitte „Verbindung prüfen"` }));
      sock.once("timeout", () => done({ ok: false, nachricht: "Timeout — Server nicht erreichbar" }));
      sock.once("error", (e) => done({ ok: false, nachricht: e.message }));
    });
  });

  // Google Drive: Routen liegen in routes/drive.ts (echter OAuth-Flow + Settings).


  // Sessions-Verwaltung entfernt (Single-User-Modus).
}
