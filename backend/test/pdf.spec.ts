// Smoke-Test für Step 5: PDF-Rendering + Cache.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const DATA = mkdtempSync(path.join(tmpdir(), "mcc-pdf-"));
process.env.DATA_DIR = DATA;
process.env.NODE_ENV = "development";

const { openDatabase, closeDatabase } = await import("../src/db/index.js");
const { ensureMasterKey } = await import("../src/crypto/masterkey.js");
const { config } = await import("../src/config.js");
const { setSetting } = await import("../src/settings/store.js");
const { createKunde } = await import("../src/kunden/repo.js");
const { createAngebot, updateAngebot } = await import("../src/belege/angebote-repo.js");
const { createRechnung } = await import("../src/belege/rechnungen-repo.js");
const { renderAngebotPdf, renderRechnungPdf } = await import("../src/pdf/belegPdf.server.js");
const { wirePdfCacheInvalidation } = await import("../src/pdf/wireup.js");

function ensureDir(p: string) { if (!existsSync(p)) mkdirSync(p, { recursive: true, mode: 0o700 }); }

beforeAll(() => {
  ensureMasterKey(config.keyPath);
  for (const d of [config.uploadsDir, config.backupsDir, config.backupsDailyDir,
    config.backupsWeeklyDir, config.backupsMonthlyDir, config.backupsSafetyDir,
    config.backupsTmpDir]) ensureDir(d);
  openDatabase(config.dbPath);
  wirePdfCacheInvalidation();
  setSetting("firma", {
    name: "My Clean Center GmbH", strasse: "Hauptstr. 1", plz: "53757", ort: "Sankt Augustin",
    telefon: "02241/000000", email: "info@mcc.de", web: "https://mcc.de",
    ustId: "DE123456789", geschaeftsfuehrer: "Max Mustermann",
    bankName: "Sparkasse", iban: "DE12...", bic: "WELADEDD",
  });
});

afterAll(() => { closeDatabase(); rmSync(DATA, { recursive: true, force: true }); });

describe("PDF-Rendering", () => {
  it("Angebot: liefert gültiges PDF mit Belegnummer im Dateinamen", async () => {
    const k = createKunde({ typ: "firma", firmenname: "Acme GmbH", kuerzel: "ACM" });
    const a = createAngebot({
      kundeId: k.id, titel: "Treppenhausreinigung",
      positionen: [{ beschreibung: "Wischen", menge: 2, einzelpreisNetto: 50, steuersatz: 19 }],
    });
    const r = await renderAngebotPdf(a.id);
    expect(r).not.toBeNull();
    expect(r!.buffer.length).toBeGreaterThan(500);
    expect(r!.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(r!.dateiname).toContain(a.nummer);
    expect(r!.dateiname).toContain("Acme");
    expect(r!.fromCache).toBe(false);
  });

  it("Cache: zweiter Aufruf kommt aus Cache mit identischen Bytes", async () => {
    const k = createKunde({ typ: "firma", firmenname: "Beta GmbH", kuerzel: "BET" });
    const a = createAngebot({ kundeId: k.id, titel: "X",
      positionen: [{ beschreibung: "P", menge: 1, einzelpreisNetto: 10 }] });
    const r1 = await renderAngebotPdf(a.id);
    const r2 = await renderAngebotPdf(a.id);
    expect(r1!.fromCache).toBe(false);
    expect(r2!.fromCache).toBe(true);
    expect(r2!.hash).toBe(r1!.hash);
    expect(Buffer.compare(r1!.buffer, r2!.buffer)).toBe(0);
  });

  it("Cache wird bei Mutation invalidiert (neuer Hash)", async () => {
    const k = createKunde({ typ: "firma", firmenname: "Gamma GmbH", kuerzel: "GAM" });
    const a = createAngebot({ kundeId: k.id, titel: "Y",
      positionen: [{ beschreibung: "P", menge: 1, einzelpreisNetto: 10 }] });
    const r1 = await renderAngebotPdf(a.id);
    updateAngebot(a.id, {
      positionen: [{ beschreibung: "P-neu", menge: 5, einzelpreisNetto: 99, steuersatz: 19 }],
    });
    const r2 = await renderAngebotPdf(a.id);
    expect(r2!.hash).not.toBe(r1!.hash);
    expect(r2!.fromCache).toBe(false);
    // Nur die aktuelle Cache-Datei soll übrig sein
    const dir = path.join(config.dataDir, "pdf-cache", "angebot");
    const matching = readdirSync(dir).filter((f) => f.startsWith(`${a.id}-`));
    expect(matching).toHaveLength(1);
  });

  it("Rechnung: rendert ebenfalls gültiges PDF", async () => {
    const k = createKunde({ typ: "firma", firmenname: "Delta GmbH", kuerzel: "DEL" });
    const r = createRechnung({ kundeId: k.id, titel: "Re-Test",
      positionen: [{ beschreibung: "Service", menge: 1, einzelpreisNetto: 100, steuersatz: 19 }] });
    const out = await renderRechnungPdf(r.id);
    expect(out!.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(out!.dateiname).toContain(r.nummer);
  });

  it("Unbekannte ID liefert null", async () => {
    expect(await renderAngebotPdf("does-not-exist")).toBeNull();
    expect(await renderRechnungPdf("does-not-exist")).toBeNull();
  });
});
