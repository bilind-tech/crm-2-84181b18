// Hängt sich an Dokument-Erstellung und enqueued einen Drive-Upload,
// wenn Auto-Upload aktiv und Drive verbunden ist.
import { on } from "../events/bus.js";
import { enqueue } from "../drive/upload-repo.js";
import { loadDriveSettings } from "../drive/oauth.js";
import { getDokument, getDokumentRaw } from "./repo.js";
import { getMap as getOrdnerMap } from "./ordner-drive-map-repo.js";

let wired = false;

function driveBereit(): boolean {
  const s = loadDriveSettings();
  if (s.autoUpload === false) return false;
  return !!(s.refreshTokenIsSet && s.clientSecretIsSet);
}

export function wireDokumenteDriveAutoEnqueue(): void {
  if (wired) return;
  wired = true;

  on("dokument:erstellt", (payload) => {
    try {
      const id = payload?.id;
      if (!id || !driveBereit()) return;
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

  on("dokument:verschoben", (p) => {
    try {
      if (!driveBereit()) return;
      const dok = getDokument(p.id);
      if (!dok) return;
      enqueue({
        belegArt: "dokument_move",
        belegId: p.id,
        dateiName: dok.dateiname ?? p.id,
        pdfSha256: dok.sha256 ?? p.id,
        idempotenzKey: `dokument-move-${p.id}-${p.ordnerIdNachher ?? "root"}-${Date.now()}`,
        opPayload: { ordnerIdVorher: p.ordnerIdVorher, ordnerIdNachher: p.ordnerIdNachher },
      });
    } catch (e) { console.error("dokument move enqueue", e); }
  });

  on("dokument:geloescht", (p) => {
    try {
      if (!driveBereit()) return;
      const raw = getDokumentRaw(p.id);
      const fileId = raw?.drive_file_id ?? null;
      if (!fileId) return;
      enqueue({
        belegArt: "dokument_delete",
        belegId: p.id,
        dateiName: raw?.dateiname ?? p.id,
        pdfSha256: raw?.sha256 ?? p.id,
        idempotenzKey: `dokument-delete-${p.id}-${fileId}`,
        opPayload: { fileId },
      });
    } catch (e) { console.error("dokument delete enqueue", e); }
  });

  on("ordner:erstellt", (p) => {
    try {
      if (!driveBereit()) return;
      enqueue({
        belegArt: "ordner_create",
        belegId: p.id,
        dateiName: p.id,
        pdfSha256: p.id,
        idempotenzKey: `ordner-create-${p.id}`,
      });
    } catch (e) { console.error("ordner create enqueue", e); }
  });

  on("ordner:umbenannt", (p) => {
    try {
      if (!driveBereit()) return;
      enqueue({
        belegArt: "ordner_rename",
        belegId: p.id,
        dateiName: p.nameNachher,
        pdfSha256: p.id,
        idempotenzKey: `ordner-rename-${p.id}-${p.nameNachher}-${Date.now()}`,
        opPayload: { nameVorher: p.nameVorher, nameNachher: p.nameNachher },
      });
    } catch (e) { console.error("ordner rename enqueue", e); }
  });

  on("ordner:verschoben", (p) => {
    try {
      if (!driveBereit()) return;
      enqueue({
        belegArt: "ordner_move",
        belegId: p.id,
        dateiName: p.id,
        pdfSha256: p.id,
        idempotenzKey: `ordner-move-${p.id}-${p.parentNachher ?? "root"}-${Date.now()}`,
        opPayload: { parentVorher: p.parentVorher, parentNachher: p.parentNachher },
      });
    } catch (e) { console.error("ordner move enqueue", e); }
  });

  on("ordner:geloescht", (p) => {
    try {
      if (!driveBereit()) return;
      const m = getOrdnerMap(p.id);
      if (!m) return; // Nie in Drive gewesen → nichts zu tun.
      enqueue({
        belegArt: "ordner_delete",
        belegId: p.id,
        dateiName: p.id,
        pdfSha256: p.id,
        idempotenzKey: `ordner-delete-${p.id}-${Date.now()}`,
        opPayload: { modus: p.modus, nachfolger: p.nachfolger ?? [] },
      });
      // Bei cascade: Mappings der Nachfahren werden über den Move des Wurzel-Ordners
      // implizit miterledigt (Drive verschiebt rekursiv). Wir markieren sie aber
      // beim Worker-Schritt als gelöscht.
    } catch (e) { console.error("ordner delete enqueue", e); }
  });
}
