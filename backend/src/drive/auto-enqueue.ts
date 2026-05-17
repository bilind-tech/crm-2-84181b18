// Hängt sich an Beleg-Mutationen und enqueued Drive-Uploads für versendete
// Rechnungen / akzeptierte Angebote, wenn Drive verbunden ist.
import crypto from "node:crypto";
import { onBelegVersendet } from "../belege/events.js";
import { renderAngebotPdf, renderRechnungPdf } from "../pdf/belegPdf.server.js";
import { getAngebot } from "../belege/angebote-repo.js";
import { getRechnung } from "../belege/rechnungen-repo.js";
import { enqueue } from "./upload-repo.js";
import { loadDriveSettings } from "./oauth.js";

let wired = false;

export function wireDriveAutoEnqueue(): void {
  if (wired) return;
  wired = true;
  // Drive-Upload wird AUSSCHLIESSLICH ausgelöst, nachdem der Beleg vom User
  // manuell per E-Mail versendet wurde. Damit gilt: kein Versand → kein Drive-
  // Upload. Statusänderungen ohne Versand (z. B. Entwurf-Update, „angenommen"
  // klicken, Zahlung erfassen) triggern KEIN Drive-Upload mehr.
  onBelegVersendet(async (art, id) => {
    try {
      const settings = loadDriveSettings();
      if (settings.autoUpload === false) return;
      const beleg = art === "angebot" ? getAngebot(id) : getRechnung(id);
      if (!beleg) return;

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
