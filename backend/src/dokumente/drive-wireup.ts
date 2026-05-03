// Hängt sich an Dokument-Erstellung und enqueued einen Drive-Upload,
// wenn Auto-Upload aktiv und Drive verbunden ist.
import { on } from "../events/bus.js";
import { enqueue } from "../drive/upload-repo.js";
import { loadDriveSettings } from "../drive/oauth.js";
import { getDokument } from "./repo.js";

let wired = false;

export function wireDokumenteDriveAutoEnqueue(): void {
  if (wired) return;
  wired = true;
  onEvent("dokument:erstellt", (payload: unknown) => {
    try {
      const id = (payload as { id?: string } | null)?.id;
      if (!id) return;
      const settings = loadDriveSettings();
      if (settings.autoUpload === false) return;
      if (!settings.refreshTokenIsSet || !settings.clientSecretIsSet) return;
      const dok = getDokument(id);
      if (!dok) return;
      enqueue({
        belegArt: "dokument",
        belegId: id,
        dateiName: dok.dateiname ?? `Dokument-${id}`,
        pdfSha256: dok.sha256 ?? id,
        idempotenzKey: `dokument-${id}-${(dok.sha256 ?? "").slice(0, 16)}`,
      });
    } catch (e) {
      console.error("dokument drive auto-enqueue", e);
    }
  });
}
