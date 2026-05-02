// Vitest-Suite für Step 4: Belege (Angebote, Rechnungen, Zahlungen, Status, Umwandlung).
// Kein HTTP — direkt gegen Repos und Status-Engine. Frische DB pro Suite.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const DATA = mkdtempSync(path.join(tmpdir(), "mcc-belege-"));
process.env.DATA_DIR = DATA;
process.env.NODE_ENV = "development";
process.env.PORT = "0";
process.env.HOST = "127.0.0.1";

const { openDatabase, closeDatabase, getDatabase } = await import("../src/db/index.js");
const { ensureMasterKey } = await import("../src/crypto/masterkey.js");
const { config } = await import("../src/config.js");
const { createKunde } = await import("../src/kunden/repo.js");
const { vergebeBelegnummer } = await import("../src/belege/belegnummer.js");
const { periodeMMYY } = await import("../src/kunden/nummern.js");
const {
  createAngebot,
  getAngebot,
  updateAngebot,
  sendeAngebot,
  duplicateAngebot,
} = await import("../src/belege/angebote-repo.js");
const {
  createRechnung,
  getRechnung,
  updateRechnung,
  sendeRechnung,
} = await import("../src/belege/rechnungen-repo.js");
const { addZahlung, deleteZahlung } = await import("../src/belege/zahlungen.js");
const { angebotInRechnungUmwandeln } = await import("../src/belege/umwandeln.js");
const { rechnungBruttoCt, zahlungSummeCt } = await import("../src/belege/totals.js");
const { recomputeRechnungStatus, markOverdueRechnungen, isValidAngebotTransition } =
  await import("../src/belege/status.js");

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true, mode: 0o700 });
}

beforeAll(() => {
  ensureMasterKey(config.keyPath);
  for (const d of [
    config.uploadsDir,
    config.backupsDir,
    config.backupsDailyDir,
    config.backupsWeeklyDir,
    config.backupsMonthlyDir,
    config.backupsSafetyDir,
    config.backupsTmpDir,
  ]) ensureDir(d);
  openDatabase(config.dbPath);
});

afterAll(() => {
  closeDatabase();
  rmSync(DATA, { recursive: true, force: true });
});

function neuerKunde(kuerzel: string | null = "GFU", zahlungsziel = 14) {
  return createKunde({
    typ: "firma",
    firmenname: `Firma ${kuerzel ?? "X"} ${Math.random().toString(36).slice(2, 6)}`,
    kuerzel,
    zahlungszielTage: zahlungsziel,
  });
}

// ---------------------------------------------------------------------------
describe("Belegnummern", () => {
  it("vergibt fortlaufende Nummern pro (Kunde, Periode)", () => {
    const k = neuerKunde("AAA");
    const datum = new Date(2026, 4, 15); // Mai 2026 → MMYY = 0526
    const n1 = vergebeBelegnummer(k.id, "rechnung", datum);
    const n2 = vergebeBelegnummer(k.id, "rechnung", datum);
    const n3 = vergebeBelegnummer(k.id, "angebot", datum);
    const periode = periodeMMYY(datum);
    expect(periode).toBe("0526");
    expect(n1).toBe(`AAA0526/01`);
    expect(n2).toBe(`AAA0526/02`);
    // Zähler ist gemeinsam pro (Kunde, Periode)
    expect(n3).toBe(`AAA0526/03`);
  });

  it("nutzt Fallback-Präfix ohne Kürzel", () => {
    const k = neuerKunde(null);
    const datum = new Date(2026, 4, 15);
    const n = vergebeBelegnummer(k.id, "angebot", datum);
    expect(n.startsWith("AN0526/")).toBe(true);
  });

  it("Zähler sind pro Kunde isoliert", () => {
    const a = neuerKunde("BBB");
    const b = neuerKunde("CCC");
    const datum = new Date(2026, 5, 1);
    expect(vergebeBelegnummer(a.id, "rechnung", datum)).toBe("BBB0626/01");
    expect(vergebeBelegnummer(b.id, "rechnung", datum)).toBe("CCC0626/01");
  });
});

// ---------------------------------------------------------------------------
describe("Angebote-Repo", () => {
  it("erstellt, aktualisiert und ersetzt Positionen", () => {
    const k = neuerKunde("DDD");
    const a = createAngebot({
      kundeId: k.id,
      titel: "Reinigung Treppenhaus",
      positionen: [
        { beschreibung: "Wischen", menge: 2, einzelpreisNetto: 50, steuersatz: 19 },
      ],
    });
    expect(a.nummer).toMatch(/^DDD\d{4}\/01$/);
    expect(a.status).toBe("entwurf");
    expect(a.positionen).toHaveLength(1);

    const a2 = updateAngebot(a.id, {
      titel: "Neuer Titel",
      positionen: [
        { beschreibung: "A", menge: 1, einzelpreisNetto: 10, steuersatz: 19 },
        { beschreibung: "B", menge: 3, einzelpreisNetto: 20, steuersatz: 7 },
      ],
    });
    expect(a2?.titel).toBe("Neuer Titel");
    expect(a2?.positionen).toHaveLength(2);
  });

  it("Status-Transitions funktionieren", () => {
    expect(isValidAngebotTransition("entwurf", "versendet")).toBe(true);
    expect(isValidAngebotTransition("versendet", "angenommen")).toBe(true);
    expect(isValidAngebotTransition("angenommen", "versendet")).toBe(false);
    expect(isValidAngebotTransition("entwurf", "angenommen")).toBe(false);
  });

  it("sendeAngebot setzt versendet_am und Status", () => {
    const k = neuerKunde("EEE");
    const a = createAngebot({ kundeId: k.id, titel: "X" });
    const sent = sendeAngebot(a.id);
    expect(sent?.status).toBe("versendet");
    expect(sent?.versendetAm).toBeTruthy();
  });

  it("duplicateAngebot kopiert Positionen, neue Nummer, Status entwurf", () => {
    const k = neuerKunde("FFF");
    const a = createAngebot({
      kundeId: k.id,
      titel: "Original",
      positionen: [{ beschreibung: "P", menge: 1, einzelpreisNetto: 100 }],
    });
    sendeAngebot(a.id);
    const dup = duplicateAngebot(a.id)!;
    expect(dup.id).not.toBe(a.id);
    expect(dup.status).toBe("entwurf");
    expect(dup.positionen).toHaveLength(1);
    expect(dup.nummer).not.toBe(a.nummer);
  });
});

// ---------------------------------------------------------------------------
describe("Rechnungen, Totals & Zahlungen (Status-Lifecycle)", () => {
  it("rechnungBruttoCt rechnet Mengen+Rabatt+Steuer korrekt (in Cent)", () => {
    const k = neuerKunde("GGG");
    // 2 × 100 € = 200 € netto, 19% USt → 238 € brutto = 23800 ct
    const r = createRechnung({
      kundeId: k.id,
      titel: "Test",
      positionen: [
        { beschreibung: "x", menge: 2, einzelpreisNetto: 100, steuersatz: 19 },
      ],
    });
    expect(rechnungBruttoCt(getDatabase(), r.id)).toBe(23800);

    // Mit 10% Position-Rabatt: 200 * 0.9 = 180 → *1.19 = 214.20 → 21420 ct
    updateRechnung(r.id, {
      positionen: [
        { beschreibung: "x", menge: 2, einzelpreisNetto: 100, steuersatz: 19, rabatt: 10 },
      ],
    });
    expect(rechnungBruttoCt(getDatabase(), r.id)).toBe(21420);
  });

  it("Teilzahlung → status=teilbezahlt; volle Zahlung → bezahlt", () => {
    const k = neuerKunde("HHH");
    const r = createRechnung({
      kundeId: k.id,
      titel: "Teilzahl",
      positionen: [{ beschreibung: "x", menge: 1, einzelpreisNetto: 100, steuersatz: 19 }],
    });
    sendeRechnung(r.id);
    // Brutto = 119 €
    addZahlung(r.id, { betrag: 50 });
    let rr = getRechnung(r.id)!;
    expect(rr.status).toBe("teilbezahlt");
    expect(zahlungSummeCt(getDatabase(), r.id)).toBe(5000);

    addZahlung(r.id, { betrag: 69 });
    rr = getRechnung(r.id)!;
    expect(rr.status).toBe("bezahlt");
    expect(zahlungSummeCt(getDatabase(), r.id)).toBe(11900);
  });

  it("Zahlung löschen fällt auf vorigen Status zurück", () => {
    const k = neuerKunde("III");
    const r = createRechnung({
      kundeId: k.id,
      titel: "Rückfall",
      positionen: [{ beschreibung: "x", menge: 1, einzelpreisNetto: 100, steuersatz: 19 }],
    });
    sendeRechnung(r.id);
    const z = addZahlung(r.id, { betrag: 119 })!;
    expect(getRechnung(r.id)!.status).toBe("bezahlt");
    deleteZahlung(r.id, z.id);
    expect(getRechnung(r.id)!.status).toBe("versendet");
  });

  it("storniert ist terminal — recompute überschreibt nicht", () => {
    const k = neuerKunde("JJJ");
    const r = createRechnung({
      kundeId: k.id,
      titel: "S",
      positionen: [{ beschreibung: "x", menge: 1, einzelpreisNetto: 100 }],
    });
    updateRechnung(r.id, { status: "storniert" });
    expect(getRechnung(r.id)!.status).toBe("storniert");
    addZahlung(r.id, { betrag: 50 });
    // recompute respektiert storniert
    expect(recomputeRechnungStatus(r.id)).toBe("storniert");
  });

  it("markOverdueRechnungen setzt überfällige Rechnungen", () => {
    const k = neuerKunde("KKK");
    const r = createRechnung({
      kundeId: k.id,
      titel: "Alt",
      rechnungsdatum: "2025-01-01",
      faelligkeitsdatum: "2025-01-15",
      positionen: [{ beschreibung: "x", menge: 1, einzelpreisNetto: 50 }],
    });
    sendeRechnung(r.id);
    const changed = markOverdueRechnungen("2026-05-01");
    expect(changed).toBeGreaterThanOrEqual(1);
    expect(getRechnung(r.id)!.status).toBe("ueberfaellig");
  });
});

// ---------------------------------------------------------------------------
describe("Angebot → Rechnung Umwandlung", () => {
  it("erzeugt Rechnung mit kopierten Positionen, setzt Angebot=angenommen, idempotent", () => {
    const k = neuerKunde("LLL");
    const a = createAngebot({
      kundeId: k.id,
      titel: "Umwandeln",
      positionen: [
        { beschreibung: "P1", menge: 2, einzelpreisNetto: 25, steuersatz: 19 },
        { beschreibung: "P2", menge: 1, einzelpreisNetto: 100, steuersatz: 7 },
      ],
    });
    sendeAngebot(a.id);
    const r = angebotInRechnungUmwandeln(a.id)!;
    expect(r).not.toBeNull();
    expect(r.positionen).toHaveLength(2);
    expect(r.quellAngebotId).toBe(a.id);
    expect(getAngebot(a.id)!.status).toBe("angenommen");

    // Idempotent: zweiter Aufruf liefert dieselbe Rechnung
    const r2 = angebotInRechnungUmwandeln(a.id)!;
    expect(r2.id).toBe(r.id);
  });
});
