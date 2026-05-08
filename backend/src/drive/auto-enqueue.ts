// Hängt sich an Beleg-Mutationen und enqueued Drive-Uploads für versendete
// Rechnungen / akzeptierte Angebote, wenn Drive verbunden ist.
import crypto from "node:crypto";
import { onBelegMutated } from "../belege/events.js";
import { renderAngebotPdf, renderRechnungPdf } from "../pdf/belegPdf.server.js";
import { getAngebot } from "../belege/angebote-repo.js";
import { getRechnung } from "../belege/rechnungen-repo.js";
import { enqueue } from "./upload-repo.js";
import { loadDriveSettings } from "./oauth.js";

let wired = false;

export function wireDriveAutoEnqueue(): void {
  if (wired) return;
  wired = true;
  onBelegMutated(async (art, id) => {
    try {
      const settings = loadDriveSettings();
      if (settings.autoUpload === false) return;
      // WICHTIG: Wir enqueuen IMMER, auch wenn Drive (noch) nicht verbunden ist.
      // Der Worker pausiert solange `refreshTokenIsSet === false` ist und arbeitet
      // alle wartenden Belege automatisch ab, sobald der User Drive verbindet.
      // So funktioniert „Beleg jetzt erstellen, Drive später verbinden" out of the box.

      const beleg = art === "angebot" ? getAngebot(id) : getRechnung(id);
      if (!beleg) return;
      // Nur bei "fertigem" Status hochladen
      const status = (beleg as { status?: string }).status;
      if (art === "angebot" && status !== "angenommen" && status !== "versendet") return;
      if (art === "rechnung" && status !== "versendet" && status !== "bezahlt" && status !== "teilbezahlt") return;

      const pdf = art === "angebot" ? await renderAngebotPdf(id) : await renderRechnungPdf(id);
      if (!pdf) return;
      const sha = crypto.createHash("sha256").update(pdf.buffer).digest("hex");
      enqueue({
        belegArt: art,
        belegId: id,
        dateiName: pdf.dateiname,
        pdfSha256: sha,
        idempotenzKey: `${art}-${(beleg as { nummer?: string }).nummer ?? id}-${sha.slice(0, 16)}`,
      });
    } catch (e) {
      console.error("drive auto-enqueue", e);
    }
  });
}
