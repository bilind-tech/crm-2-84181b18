// Regressions-Test: manuelle Korrektur des nächsten Belegnummer-Zählers
// muss exakt persistiert werden — auch nach unten und auf 1.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const DATA = mkdtempSync(path.join(tmpdir(), "mcc-zaehler-"));
process.env.DATA_DIR = DATA;
process.env.NODE_ENV = "development";
process.env.PORT = "0";
process.env.HOST = "127.0.0.1";

const { openDatabase, closeDatabase } = await import("../src/db/index.js");
const { ensureMasterKey } = await import("../src/crypto/masterkey.js");
const { config } = await import("../src/config.js");
const { createKunde } = await import("../src/kunden/repo.js");
const { setBelegNummerStart, peekBelegNummer, periodeMMYY } = await import(
  "../src/kunden/nummern.js"
);

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true, mode: 0o700 });
}

beforeAll(() => {
  ensureMasterKey(config.keyPath);
  for (const d of [config.uploadsDir, config.backupsDir]) ensureDir(d);
  openDatabase(config.dbPath);
});

afterAll(() => {
  closeDatabase();
  rmSync(DATA, { recursive: true, force: true });
});

describe("setBelegNummerStart — exakter Set, auch nach unten", () => {
  it("setzt hoch, dann wieder runter, dann auf 1", () => {
    const k = createKunde({
      typ: "firma",
      firmenname: "Test GmbH",
      kuerzel: "TST",
    } as Parameters<typeof createKunde>[0]);
    const periode = periodeMMYY();

    setBelegNummerStart(k.id, "rechnung", periode, 7);
    expect(peekBelegNummer(k.id, "rechnung", periode)).toBe(7);

    // nach unten korrigieren — das war der Bug
    setBelegNummerStart(k.id, "rechnung", periode, 3);
    expect(peekBelegNummer(k.id, "rechnung", periode)).toBe(3);

    // auf 1 zurücksetzen
    setBelegNummerStart(k.id, "rechnung", periode, 1);
    expect(peekBelegNummer(k.id, "rechnung", periode)).toBe(1);
  });
});