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
import { requireAuth, getCookieToken } from "../auth/middleware.js";
import { audit } from "../auth/audit.js";
import { emit } from "../events/bus.js";
import {
  deleteAllSessionsForUser,
  deleteSessionForUser,
  listSessions,
} from "../auth/sessions.js";
import { createConnection } from "node:net";
import { resetTransport } from "../email/transport.js";
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
    "firma",
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
    }
    const r = patchArea("smtp", core);
    if (!r.ok) {
      reply.status(r.status);
      return { error: r.error, issues: r.issues };
    }
    resetTransport();
    audit({ userId: req.user?.id, action: "settings.smtp.patch", ip: req.ip });
    emit("einstellung:geaendert", { key: "smtp", userId: req.user?.id ?? null });
    const meta = getSettingMeta(SENSITIVE_KEYS.smtpPassword);
    return smtpToWire(r.value as Record<string, unknown>, meta);
  });
  app.delete("/einstellungen/smtp/passwort", async (req) => {
    deleteSetting(SENSITIVE_KEYS.smtpPassword);
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


  // Sessions
  app.get("/einstellungen/sitzungen", async (req) => {
    if (!req.user) return [];
    const currentToken = getCookieToken(req);
    return listSessions(req.user.id).map((s) => ({ ...s, isCurrent: s.token === currentToken }));
  });
  app.delete("/einstellungen/sitzungen/:token", async (req, reply) => {
    if (!req.user) {
      reply.status(401);
      return { error: "unauthenticated" };
    }
    const params = z.object({ token: z.string().min(1) }).safeParse(req.params);
    if (!params.success) {
      reply.status(422);
      return { error: "validation" };
    }
    const ok = deleteSessionForUser(params.data.token, req.user.id);
    if (!ok) {
      reply.status(404);
      return { error: "not-found" };
    }
    audit({ userId: req.user.id, action: "settings.sessions.revoke", ip: req.ip });
    return { ok: true };
  });
  app.post("/einstellungen/sitzungen/alle-beenden", async (req) => {
    if (!req.user) return { revoked: 0 };
    const currentToken = getCookieToken(req);
    const n = deleteAllSessionsForUser(req.user.id, currentToken);
    audit({
      userId: req.user.id,
      action: "settings.sessions.revoke-all",
      detail: { revoked: n },
      ip: req.ip,
    });
    return { revoked: n };
  });
}
