// Drift-Check: vergleicht CRM-Daten mit Drive und enqueued fehlende Operationen.
// SICHERHEIT: enqueued nur additive Ops (ordner_create, ordner_move,
// dokument upload, dokument_move). Niemals *_delete. Lokale Daten werden
// nicht angefasst.
import crypto from "node:crypto";
import { listOrdner } from "../dokumente/ordner-repo.js";
import { listDokumente } from "../dokumente/repo.js";
import { listMaps } from "../dokumente/ordner-drive-map-repo.js";
import { enqueue } from "./upload-repo.js";
import { backfillOne } from "./backfill.js";
import { loadDriveSettings } from "./oauth.js";

export interface DriftResult {
  ordnerNeu: number;
  ordnerVerschoben: number;
  dokumenteNeu: number;
  dokumenteVerschoben: number;
  uebersprungen: number;
}

/** Enqueued additive Ops für alles, was in Drive fehlt oder dort am
 *  falschen Platz liegt. Idempotent (Queue verhindert Duplikate). */
export async function driftCheckDokumente(): Promise<DriftResult> {
  const out: DriftResult = {
    ordnerNeu: 0, ordnerVerschoben: 0,
    dokumenteNeu: 0, dokumenteVerschoben: 0,
    uebersprungen: 0,
  };
  const settings = loadDriveSettings();
  if (!settings.refreshTokenIsSet) return out;

  const ordner = listOrdner();
  const maps = new Map(listMaps(false).map((m) => [m.ordnerId, m]));

  // Hierarchie depth-first: Eltern zuerst. Sortiere nach Tiefe (Anzahl Vorfahren).
  const tiefeVon = new Map<string, number>();
  const ordnerMap = new Map(ordner.map((o) => [o.id, o]));
  function tiefe(id: string): number {
    if (tiefeVon.has(id)) return tiefeVon.get(id)!;
    const o = ordnerMap.get(id);
    if (!o || !o.parentId) { tiefeVon.set(id, 0); return 0; }
    const t = tiefe(o.parentId) + 1;
    tiefeVon.set(id, t);
    return t;
  }
  const sortiert = [...ordner].sort((a, b) => tiefe(a.id) - tiefe(b.id));

  for (const o of sortiert) {
    const m = maps.get(o.id);
    if (!m || m.geloeschtAm) {
      // Fehlend → anlegen lassen
      enqueue({
        belegArt: "ordner_create",
        belegId: o.id,
        dateiName: o.name,
        pdfSha256: crypto.createHash("sha256").update(`ordner-${o.id}`).digest("hex"),
        idempotenzKey: `drift-ordner-create-${o.id}`,
      });
      out.ordnerNeu++;
      continue;
    }
    if (m.fehlerText) {
      // Letzter Versuch hatte Fehler → neu enqueuen
      enqueue({
        belegArt: "ordner_create",
        belegId: o.id,
        dateiName: o.name,
        pdfSha256: crypto.createHash("sha256").update(`ordner-${o.id}-retry`).digest("hex"),
        idempotenzKey: `drift-ordner-retry-${o.id}-${Date.now()}`,
      });
      out.uebersprungen++;
      continue;
    }
    // Pfad-Drift: aktueller Soll-Pfad vs. zuletzt persistierter Drive-Pfad
    const sollPfad = sollPfadFor(o.id, ordnerMap);
    if (sollPfad !== m.drivePfad) {
      enqueue({
        belegArt: "ordner_move",
        belegId: o.id,
        dateiName: o.name,
        pdfSha256: crypto.createHash("sha256").update(`move-${o.id}-${sollPfad}`).digest("hex"),
        idempotenzKey: `drift-ordner-move-${o.id}-${hashPfad(sollPfad)}`,
      });
      out.ordnerVerschoben++;
    }
  }

  // Dokumente: harte Obergrenze 1000 pro Lauf (Pi-freundlich).
  const dokumente = listDokumente({ limit: 1000 } as never);
  for (const d of dokumente) {
    const fileId = d.drive?.fileId ?? null;
    const hatFehler = d.drive?.status === "fehler" || !!d.drive?.fehlerText;
    if (!fileId || hatFehler) {
      try {
        const ok = await backfillOne("dokument", d.id);
        if (ok) out.dokumenteNeu++;
        else out.uebersprungen++;
      } catch {
        out.uebersprungen++;
      }
      continue;
    }
    // Move-Drift: Dokument ist in Drive, aber CRM-Ordner änderte sich seit
    // letztem Upload. Enqueue dokument_move — Worker prüft den Ist-Parent.
    enqueue({
      belegArt: "dokument_move",
      belegId: d.id,
      dateiName: d.dateiname ?? "Dokument",
      pdfSha256: crypto.createHash("sha256").update(`dokmove-${d.id}-${d.ordnerId ?? "root"}`).digest("hex"),
      idempotenzKey: `drift-dok-move-${d.id}-${d.ordnerId ?? "root"}`,
    });
    out.dokumenteVerschoben++;
  }

  return out;
}

function sollPfadFor(
  id: string,
  alle: Map<string, { id: string; name: string; parentId: string | null }>,
): string {
  const segs: string[] = [];
  let cur: string | null = id;
  const guard = new Set<string>();
  while (cur) {
    if (guard.has(cur)) break;
    guard.add(cur);
    const o = alle.get(cur);
    if (!o) break;
    segs.unshift(o.name);
    cur = o.parentId;
  }
  return ["Dokumente", ...segs].join("/");
}

function hashPfad(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 12);
}