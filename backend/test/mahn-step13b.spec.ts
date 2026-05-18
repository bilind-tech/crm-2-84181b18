// Step 13b — Mahn-Settings-Adapter (flach ↔ nested) + Steuer-Frist-Cron.
import { describe, expect, it } from "vitest";
import { flachZuUi, uiPatchZuFlach } from "../src/mahnung/settings-adapter.js";
import { fristStatusFor } from "../src/steuern/fristen.js";
import { MahnungSchema } from "../src/settings/schemas.js";

describe("mahn settings adapter", () => {
  it("baut nested UI-Shape aus flachem Schema", () => {
    const flach = MahnungSchema.parse({});
    const ui = flachZuUi(flach);
    expect(ui.modus).toBe("vorschlag");
    expect(ui.cronZeit).toMatch(/^\d{2}:\d{2}$/);
    expect(ui.stufen).toHaveLength(3);
    expect(ui.stufen[0].stufe).toBe(1);
    expect(ui.stufen[1].gebuehr).toBe(5);
    expect(ui.autoVorschlagAktiv).toBe(true);
  });

  it("mappt nested UI-Patch zurück nach flach", () => {
    const patch = uiPatchZuFlach({
      autoVorschlagAktiv: false,
      modus: "auto",
      cronZeit: "09:15",
      nurAnWerktagen: false,
      stufen: [
        { stufe: 1, bezeichnung: "x", tageNachVorgaenger: 5, gebuehr: 0, fristTage: 7 },
        { stufe: 2, bezeichnung: "x", tageNachVorgaenger: 10, gebuehr: 7.5, fristTage: 7 },
        { stufe: 3, bezeichnung: "x", tageNachVorgaenger: 14, gebuehr: 20, fristTage: 7, emailVorlageId: "v3" },
      ],
    });
    expect(patch.aktiv).toBe(false);
    expect(patch.modus).toBe("auto");
    expect(patch.cronZeit).toBe("09:15");
    expect(patch.nurAnWerktagen).toBe(false);
    expect(patch.stufe1Tage).toBe(5);
    expect(patch.stufe2Tage).toBe(10);
    expect(patch.gebuehrStufe2).toBe(7.5);
    expect(patch.stufe3Tage).toBe(14);
    expect(patch.gebuehrStufe3).toBe(20);
    expect(patch.emailVorlageStufe3).toBe("v3");
  });

  it("akzeptiert auch flache Patches", () => {
    const patch = uiPatchZuFlach({ stufe1Tage: 3, modus: "aus" });
    expect(patch.stufe1Tage).toBe(3);
    expect(patch.modus).toBe("aus");
  });
});

describe("steuer frist status", () => {
  it("klassifiziert Tage relativ zu heute", () => {
    expect(fristStatusFor("2026-05-02", "2026-05-02")).toBe("heute");
    expect(fristStatusFor("2026-05-01", "2026-05-02")).toBe("ueberfaellig");
    expect(fristStatusFor("2026-05-05", "2026-05-02")).toBe("bald");
    expect(fristStatusFor("2026-06-30", "2026-05-02")).toBe("ok");
  });
});
