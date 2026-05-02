// Step 10 — Steuer-Modul: Backend-Persistenz.
// Deckt ab: Singleton-Einstellungen, manuelle Posten CRUD, Bezahlt-Markierungen
// idempotent, Validierungs-Grenzen, USt-Rhythmus-Wechsel löscht USt-Bezahlt.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const DATA = mkdtempSync(path.join(tmpdir(), "mcc-steuer-data-"));
const APP = mkdtempSync(path.join(tmpdir(), "mcc-steuer-app-"));
process.env.DATA_DIR = DATA;
process.env.APP_ROOT = APP;
process.env.NODE_ENV = "development";
process.env.PORT = "0";
process.env.HOST = "127.0.0.1";

const { default: Fastify } = await import("fastify");
const cookie = (await import("@fastify/cookie")).default;
const helmet = (await import("@fastify/helmet")).default;
const rateLimit = (await import("@fastify/rate-limit")).default;
const { openDatabase, closeDatabase, getDatabase } = await import("../src/db/index.js");
const { ensureMasterKey } = await import("../src/crypto/masterkey.js");
const { config } = await import("../src/config.js");
const { authRoutes } = await import("../src/routes/auth.js");
const { steuernRoutes } = await import("../src/routes/steuern.js");

let app: Awaited<ReturnType<typeof buildApp>>;
let cookieHeader = "";

function ensureDir(p: string) { if (!existsSync(p)) mkdirSync(p, { recursive: true, mode: 0o700 }); }

async function buildApp() {
  ensureMasterKey(config.keyPath);
  openDatabase(config.dbPath);
  for (const d of [config.uploadsDir, config.backupsDir, config.logsDir]) ensureDir(d);
  const a = Fastify({ logger: false, trustProxy: true });
  await a.register(helmet, { contentSecurityPolicy: false });
  await a.register(cookie);
  await a.register(rateLimit, { max: 1000, timeWindow: "1 minute" });
  await a.register(authRoutes);
  await a.register(steuernRoutes);
  return a;
}

async function setupAndLogin(): Promise<string> {
  const tokFile = path.join(config.dataDir, "keys", "setup.token");
  const tokRaw = readFileSync(tokFile, "utf8");
  const tokParsed = JSON.parse(tokRaw);
  const setupToken = tokParsed.token ?? tokParsed;
  const r = await app.inject({
    method: "POST", url: "/auth/setup",
    payload: { setupToken, username: "owner", password: "Sicheres-Passwort-1!" },
  });
  expect(r.statusCode).toBe(200);
  return r.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  cookieHeader = await setupAndLogin();
});

afterAll(async () => {
  await app.close();
  closeDatabase();
  rmSync(DATA, { recursive: true, force: true });
  rmSync(APP, { recursive: true, force: true });
});

describe("Steuer-Einstellungen (Singleton)", () => {
  it("liefert Defaults bei erstem GET", async () => {
    const r = await app.inject({ method: "GET", url: "/steuern/einstellungen", headers: { cookie: cookieHeader } });
    expect(r.statusCode).toBe(200);
    const j = r.json();
    expect(j.kstSatz).toBe(15);
    expect(j.gewstHebesatz).toBe(525);
    expect(j.ustRhythmus).toBe("monatlich");
    expect(j.ustPufferSatz).toBe(10);
  });

  it("PATCH validiert Grenzen — Hebesatz < 200 → 400", async () => {
    const r = await app.inject({
      method: "PATCH", url: "/steuern/einstellungen",
      headers: { cookie: cookieHeader }, payload: { gewstHebesatz: 50 },
    });
    expect(r.statusCode).toBe(400);
  });

  it("PATCH validiert Enum — ustRhythmus 'jährlich' (mit Umlaut) → 400", async () => {
    const r = await app.inject({
      method: "PATCH", url: "/steuern/einstellungen",
      headers: { cookie: cookieHeader }, payload: { ustRhythmus: "jährlich" },
    });
    expect(r.statusCode).toBe(400);
  });

  it("PATCH speichert + Singleton bleibt id=1", async () => {
    const r = await app.inject({
      method: "PATCH", url: "/steuern/einstellungen",
      headers: { cookie: cookieHeader }, payload: { gewstHebesatz: 480, ustPufferSatz: 15 },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().gewstHebesatz).toBe(480);
    expect(r.json().ustPufferSatz).toBe(15);
    const rows = getDatabase().prepare("SELECT COUNT(*) as c FROM steuer_einstellungen").get() as { c: number };
    expect(rows.c).toBe(1);
  });

  it("Reset stellt Defaults wieder her", async () => {
    const r = await app.inject({
      method: "POST", url: "/steuern/einstellungen/reset", headers: { cookie: cookieHeader },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().gewstHebesatz).toBe(525);
    expect(r.json().ustPufferSatz).toBe(10);
  });

  it("USt-Rhythmus-Wechsel löscht USt-Bezahlt-Markierungen", async () => {
    // Vorbereitung: zwei Bezahlt-Markierungen anlegen — ust- und kst-
    await app.inject({
      method: "PUT", url: "/steuern/bezahlt/ust-2026-01",
      headers: { cookie: cookieHeader }, payload: { bezahltAm: "2026-02-10" },
    });
    await app.inject({
      method: "PUT", url: "/steuern/bezahlt/kst-2026",
      headers: { cookie: cookieHeader }, payload: { bezahltAm: "2026-03-01" },
    });
    // Wechsel monatlich → quartalsweise
    const r = await app.inject({
      method: "PATCH", url: "/steuern/einstellungen",
      headers: { cookie: cookieHeader }, payload: { ustRhythmus: "quartalsweise" },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().ustBezahltGeloescht).toBe(1);
    // KSt-Markierung muss erhalten bleiben
    const list = await app.inject({ method: "GET", url: "/steuern/bezahlt", headers: { cookie: cookieHeader } });
    const m = list.json();
    expect(m["ust-2026-01"]).toBeUndefined();
    expect(m["kst-2026"]).toBeDefined();
  });
});

describe("Manuelle Posten", () => {
  let createdId = "";

  it("POST legt Posten an (201)", async () => {
    const r = await app.inject({
      method: "POST", url: "/steuern/manuelle-posten",
      headers: { cookie: cookieHeader },
      payload: {
        art: "manuell",
        titel: "IHK-Beitrag 2026",
        zeitraum: { jahr: 2026 },
        faelligAm: "2026-04-15",
        geschaetzterBetrag: 280,
        notiz: null,
      },
    });
    expect(r.statusCode).toBe(201);
    const j = r.json();
    expect(j.id).toMatch(/^man-/);
    expect(j.titel).toBe("IHK-Beitrag 2026");
    createdId = j.id;
  });

  it("GET liefert Liste sortiert", async () => {
    const r = await app.inject({ method: "GET", url: "/steuern/manuelle-posten", headers: { cookie: cookieHeader } });
    expect(r.statusCode).toBe(200);
    expect(r.json().length).toBeGreaterThan(0);
  });

  it("PATCH ändert Felder", async () => {
    const r = await app.inject({
      method: "PATCH", url: `/steuern/manuelle-posten/${createdId}`,
      headers: { cookie: cookieHeader }, payload: { geschaetzterBetrag: 320 },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().geschaetzterBetrag).toBe(320);
  });

  it("PATCH unbekannte ID → 404", async () => {
    const r = await app.inject({
      method: "PATCH", url: "/steuern/manuelle-posten/man-doesnotexist",
      headers: { cookie: cookieHeader }, payload: { geschaetzterBetrag: 1 },
    });
    expect(r.statusCode).toBe(404);
  });

  it("POST mit ungültigem Datum → 400", async () => {
    const r = await app.inject({
      method: "POST", url: "/steuern/manuelle-posten",
      headers: { cookie: cookieHeader },
      payload: { art: "manuell", titel: "X", zeitraum: { jahr: 2026 }, faelligAm: "15.04.2026", geschaetzterBetrag: 10 },
    });
    expect(r.statusCode).toBe(400);
  });

  it("DELETE entfernt Posten + Bezahlt-Markierung", async () => {
    await app.inject({
      method: "PUT", url: `/steuern/bezahlt/${createdId}`,
      headers: { cookie: cookieHeader }, payload: { bezahltAm: "2026-04-15" },
    });
    const r = await app.inject({
      method: "DELETE", url: `/steuern/manuelle-posten/${createdId}`,
      headers: { cookie: cookieHeader },
    });
    expect(r.statusCode).toBe(204);
    const list = await app.inject({ method: "GET", url: "/steuern/bezahlt", headers: { cookie: cookieHeader } });
    expect(list.json()[createdId]).toBeUndefined();
  });
});

describe("Bezahlt-Markierungen", () => {
  it("PUT idempotent — zweimal selbe ID gibt eine Zeile", async () => {
    await app.inject({
      method: "PUT", url: "/steuern/bezahlt/test-2026",
      headers: { cookie: cookieHeader }, payload: { bezahltAm: "2026-05-01", tatsaechlicherBetrag: 100 },
    });
    const r = await app.inject({
      method: "PUT", url: "/steuern/bezahlt/test-2026",
      headers: { cookie: cookieHeader }, payload: { bezahltAm: "2026-05-02", tatsaechlicherBetrag: 110 },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().tatsaechlicherBetrag).toBe(110);
    const cnt = getDatabase()
      .prepare("SELECT COUNT(*) as c FROM steuer_bezahlt_markierung WHERE posten_id=?")
      .get("test-2026") as { c: number };
    expect(cnt.c).toBe(1);
  });

  it("DELETE existierend → 204", async () => {
    const r = await app.inject({
      method: "DELETE", url: "/steuern/bezahlt/test-2026", headers: { cookie: cookieHeader },
    });
    expect(r.statusCode).toBe(204);
  });

  it("DELETE unbekannt → 404", async () => {
    const r = await app.inject({
      method: "DELETE", url: "/steuern/bezahlt/test-2026-not-here", headers: { cookie: cookieHeader },
    });
    expect(r.statusCode).toBe(404);
  });

  it("PUT mit ungültigem Datum → 400", async () => {
    const r = await app.inject({
      method: "PUT", url: "/steuern/bezahlt/test-bad",
      headers: { cookie: cookieHeader }, payload: { bezahltAm: "2026/05/01" },
    });
    expect(r.statusCode).toBe(400);
  });
});

describe("Auth-Schutz", () => {
  it("ohne Cookie → 401", async () => {
    const r = await app.inject({ method: "GET", url: "/steuern/einstellungen" });
    expect(r.statusCode).toBe(401);
  });
});
