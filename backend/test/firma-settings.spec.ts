// Roundtrip-Test für /einstellungen/firma.
// Garantiert, dass UI-Feldnamen (firmenname, webseite, logoUrl, ...) und
// alle neu hinzugefügten Felder (rechtsform, slogan, land, standardSteuersatz,
// standardZahlungszielTage) wirklich persistiert werden — also nach Neustart
// bzw. mcc-update nicht mehr verschwinden.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const DATA = mkdtempSync(path.join(tmpdir(), "mcc-firma-data-"));
const APP = mkdtempSync(path.join(tmpdir(), "mcc-firma-app-"));
process.env.DATA_DIR = DATA;
process.env.APP_ROOT = APP;
process.env.NODE_ENV = "development";
process.env.PORT = "0";
process.env.HOST = "127.0.0.1";

const { default: Fastify } = await import("fastify");
const cookie = (await import("@fastify/cookie")).default;
const helmet = (await import("@fastify/helmet")).default;
const rateLimit = (await import("@fastify/rate-limit")).default;
const { openDatabase, closeDatabase } = await import("../src/db/index.js");
const { ensureMasterKey } = await import("../src/crypto/masterkey.js");
const { config } = await import("../src/config.js");
const { authRoutes } = await import("../src/routes/auth.js");
const { einstellungenRoutes } = await import("../src/routes/einstellungen.js");

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
  await a.register(einstellungenRoutes);
  return a;
}

async function setupAndLogin(): Promise<string> {
  const tokFile = path.join(config.dataDir, "keys", "setup.token");
  const tokRaw = readFileSync(tokFile, "utf8");
  const tokParsed = JSON.parse(tokRaw);
  const setupToken = tokParsed.token ?? tokParsed;
  const r = await app.inject({
    method: "POST", url: "/auth/setup",
    payload: { setupToken, password: "Sicheres-Passwort-1!" },
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

describe("Firmendaten-Roundtrip (UI-Felder bleiben nach Speichern erhalten)", () => {
  it("PATCH mit Frontend-Feldnamen → GET liefert exakt diese Werte", async () => {
    const payload = {
      firmenname: "Acme Reinigung GmbH",
      rechtsform: "GmbH",
      slogan: "Sauber. Pünktlich. Fair.",
      inhaber: "Max Muster",
      strasse: "Hauptstr. 1",
      plz: "53757",
      ort: "Sankt Augustin",
      land: "Deutschland",
      telefon: "+49 2241 123456",
      email: "info@acme.de",
      webseite: "https://acme.de",
      ustId: "DE123456789",
      steuernummer: "220/5800/1234",
      handelsregister: "HRB 12345 AG Siegburg",
      geschaeftsfuehrer: "Max Muster",
      bankName: "Sparkasse",
      iban: "DE89370400440532013000",
      bic: "COBADEFFXXX",
      logoUrl: "data:image/png;base64,iVBORw0KGgo=",
      standardSteuersatz: 7,
      standardZahlungszielTage: 30,
    };

    const patch = await app.inject({
      method: "PATCH", url: "/einstellungen/firma",
      headers: { cookie: cookieHeader }, payload,
    });
    expect(patch.statusCode).toBe(200);

    const get = await app.inject({
      method: "GET", url: "/einstellungen/firma",
      headers: { cookie: cookieHeader },
    });
    expect(get.statusCode).toBe(200);
    const j = get.json();

    // Alle UI-Felder müssen unverändert zurückkommen.
    for (const [k, v] of Object.entries(payload)) {
      expect(j[k], `Feld '${k}' wurde nicht persistiert`).toBe(v);
    }
    // Interne Schreibweise muss parallel verfügbar bleiben (PDF nutzt 'name'/'web').
    expect(j.name).toBe(payload.firmenname);
    expect(j.web).toBe(payload.webseite);
  });

  it("Teil-PATCH überschreibt nur gesetzte Felder, lässt Rest stehen", async () => {
    const before = (await app.inject({
      method: "GET", url: "/einstellungen/firma", headers: { cookie: cookieHeader },
    })).json();

    const patch = await app.inject({
      method: "PATCH", url: "/einstellungen/firma",
      headers: { cookie: cookieHeader },
      payload: { telefon: "+49 999 0000" },
    });
    expect(patch.statusCode).toBe(200);

    const after = (await app.inject({
      method: "GET", url: "/einstellungen/firma", headers: { cookie: cookieHeader },
    })).json();

    expect(after.telefon).toBe("+49 999 0000");
    expect(after.firmenname).toBe(before.firmenname);
    expect(after.logoUrl).toBe(before.logoUrl);
    expect(after.standardSteuersatz).toBe(before.standardSteuersatz);
  });

  it("Akzeptiert auch interne Schreibweise (name/web) als Eingabe", async () => {
    const patch = await app.inject({
      method: "PATCH", url: "/einstellungen/firma",
      headers: { cookie: cookieHeader },
      payload: { name: "Backend-Name GmbH", web: "https://intern.de" },
    });
    expect(patch.statusCode).toBe(200);
    const j = patch.json();
    expect(j.firmenname).toBe("Backend-Name GmbH");
    expect(j.webseite).toBe("https://intern.de");
  });
});