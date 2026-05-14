// Repo für system_update_lauf, system_update_step, system_update_paket.
import crypto from "node:crypto";
import { getDatabase } from "../db/index.js";
import type { UpdateLauf, UpdateStep, UpdateStepId, UpdateStepStatus } from "./types.js";

interface LaufRow {
  id: string;
  gestartet_am: string;
  beendet_am: string | null;
  quelle: string;
  paket_version: string;
  paket_sha256: string;
  paket_groesse: number;
  vorherige_version: string;
  neue_version: string;
  status: string;
  aktueller_step: string;
  fehler_text: string | null;
  user_id: string | null;
  safety_backup_id: string | null;
}

interface StepRow {
  id: string;
  lauf_id: string;
  step_id: string;
  label: string;
  status: string;
  reihenfolge: number;
  gestartet_am: string | null;
  beendet_am: string | null;
  detail: string | null;
  fehler_text: string | null;
}

function mapStep(r: StepRow): UpdateStep {
  return {
    id: r.id,
    laufId: r.lauf_id,
    stepId: r.step_id as UpdateStepId,
    label: r.label,
    status: r.status as UpdateStepStatus,
    reihenfolge: r.reihenfolge,
    gestartetAm: r.gestartet_am,
    beendetAm: r.beendet_am,
    detail: r.detail,
    fehlerText: r.fehler_text,
  };
}

function mapLauf(r: LaufRow, steps: UpdateStep[]): UpdateLauf {
  return {
    id: r.id,
    gestartetAm: r.gestartet_am,
    beendetAm: r.beendet_am,
    quelle: r.quelle as "upload" | "rollback",
    paketVersion: r.paket_version,
    paketSha256: r.paket_sha256,
    paketGroesse: r.paket_groesse,
    vorherigeVersion: r.vorherige_version,
    neueVersion: r.neue_version,
    status: r.status as UpdateLauf["status"],
    aktuellerStep: r.aktueller_step,
    fehlerText: r.fehler_text,
    userId: r.user_id,
    safetyBackupId: r.safety_backup_id,
    steps,
  };
}

export interface CreateLaufInput {
  quelle: "upload" | "rollback";
  paketVersion: string;
  paketSha256: string;
  paketGroesse: number;
  vorherigeVersion: string;
  neueVersion: string;
  userId: string | null;
  steps: { stepId: UpdateStepId; label: string }[];
}

export function createLauf(input: CreateLaufInput): string {
  const id = crypto.randomUUID();
  const db = getDatabase();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO system_update_lauf
        (id, quelle, paket_version, paket_sha256, paket_groesse,
         vorherige_version, neue_version, status, aktueller_step, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'laeuft', '', ?)`,
    ).run(
      id, input.quelle, input.paketVersion, input.paketSha256, input.paketGroesse,
      input.vorherigeVersion, input.neueVersion, input.userId,
    );
    const stepIns = db.prepare(
      `INSERT INTO system_update_step
        (id, lauf_id, step_id, label, status, reihenfolge)
       VALUES (?, ?, ?, ?, 'wartet', ?)`,
    );
    input.steps.forEach((s, i) => {
      stepIns.run(crypto.randomUUID(), id, s.stepId, s.label, i);
    });
  });
  tx();
  return id;
}

export function setLaufStatus(
  laufId: string,
  status: UpdateLauf["status"],
  fields: { aktuellerStep?: string; fehlerText?: string | null; safetyBackupId?: string | null } = {},
): void {
  const fragments: string[] = ["status = ?"];
  const params: unknown[] = [status];
  if (fields.aktuellerStep !== undefined) {
    fragments.push("aktueller_step = ?");
    params.push(fields.aktuellerStep);
  }
  if (fields.fehlerText !== undefined) {
    fragments.push("fehler_text = ?");
    params.push(fields.fehlerText);
  }
  if (fields.safetyBackupId !== undefined) {
    fragments.push("safety_backup_id = ?");
    params.push(fields.safetyBackupId);
  }
  if (status === "erfolg" || status === "fehler" || status === "rollback") {
    fragments.push("beendet_am = datetime('now')");
  }
  params.push(laufId);
  getDatabase()
    .prepare(`UPDATE system_update_lauf SET ${fragments.join(", ")} WHERE id = ?`)
    .run(...params);
}

export function setStepStatus(
  laufId: string,
  stepId: UpdateStepId,
  status: UpdateStepStatus,
  detail?: string | null,
  fehlerText?: string | null,
): void {
  const db = getDatabase();
  if (status === "laeuft") {
    db.prepare(
      `UPDATE system_update_step
         SET status = 'laeuft', gestartet_am = datetime('now'),
             detail = COALESCE(?, detail)
       WHERE lauf_id = ? AND step_id = ?`,
    ).run(detail ?? null, laufId, stepId);
  } else if (status === "ok" || status === "fehler" || status === "uebersprungen") {
    db.prepare(
      `UPDATE system_update_step
         SET status = ?, beendet_am = datetime('now'),
             detail = COALESCE(?, detail),
             fehler_text = ?
       WHERE lauf_id = ? AND step_id = ?`,
    ).run(status, detail ?? null, fehlerText ?? null, laufId, stepId);
  } else {
    db.prepare(
      `UPDATE system_update_step SET status = ?, detail = COALESCE(?, detail)
        WHERE lauf_id = ? AND step_id = ?`,
    ).run(status, detail ?? null, laufId, stepId);
  }
}

export function getLauf(id: string): UpdateLauf | null {
  const db = getDatabase();
  const r = db.prepare(`SELECT * FROM system_update_lauf WHERE id = ?`).get(id) as LaufRow | undefined;
  if (!r) return null;
  const steps = db
    .prepare(`SELECT * FROM system_update_step WHERE lauf_id = ? ORDER BY reihenfolge`)
    .all(id) as StepRow[];
  return mapLauf(r, steps.map(mapStep));
}

export function getAktuellerLauf(): UpdateLauf | null {
  const r = getDatabase()
    .prepare(`SELECT * FROM system_update_lauf WHERE status = 'laeuft' ORDER BY gestartet_am DESC LIMIT 1`)
    .get() as LaufRow | undefined;
  return r ? getLauf(r.id) : null;
}

export function listHistorie(limit = 20): UpdateLauf[] {
  const db = getDatabase();
  const rows = db
    .prepare(`SELECT * FROM system_update_lauf ORDER BY gestartet_am DESC LIMIT ?`)
    .all(limit) as LaufRow[];
  return rows.map((r) => {
    const steps = db
      .prepare(`SELECT * FROM system_update_step WHERE lauf_id = ? ORDER BY reihenfolge`)
      .all(r.id) as StepRow[];
    return mapLauf(r, steps.map(mapStep));
  });
}

// --- Pakete (Staging) ---

export interface PaketRow {
  id: string;
  dateiname: string;
  groesseBytes: number;
  sha256: string;
  manifestJson: string;
  stagingPfad: string;
  validiert: boolean;
  gueltigBis: string;
}

export function insertPaket(p: Omit<PaketRow, "validiert"> & { validiert: boolean }): void {
  getDatabase()
    .prepare(
      `INSERT INTO system_update_paket
        (id, dateiname, groesse_bytes, sha256, manifest_json, staging_pfad, validiert, gueltig_bis)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      p.id, p.dateiname, p.groesseBytes, p.sha256,
      p.manifestJson, p.stagingPfad, p.validiert ? 1 : 0, p.gueltigBis,
    );
}

export function getPaket(id: string): PaketRow | null {
  const r = getDatabase()
    .prepare(`SELECT * FROM system_update_paket WHERE id = ?`)
    .get(id) as
    | {
        id: string; dateiname: string; groesse_bytes: number; sha256: string;
        manifest_json: string; staging_pfad: string; validiert: number; gueltig_bis: string;
      }
    | undefined;
  if (!r) return null;
  return {
    id: r.id,
    dateiname: r.dateiname,
    groesseBytes: r.groesse_bytes,
    sha256: r.sha256,
    manifestJson: r.manifest_json,
    stagingPfad: r.staging_pfad,
    validiert: r.validiert === 1,
    gueltigBis: r.gueltig_bis,
  };
}

export function deletePaket(id: string): void {
  getDatabase().prepare(`DELETE FROM system_update_paket WHERE id = ?`).run(id);
}

export function isPaketValide(id: string): boolean {
  const r = getDatabase()
    .prepare(`SELECT validiert, gueltig_bis FROM system_update_paket WHERE id = ?`)
    .get(id) as { validiert: number; gueltig_bis: string } | undefined;
  if (!r) return false;
  if (r.validiert !== 1) return false;
  return new Date(r.gueltig_bis).getTime() > Date.now();
}

export function purgeExpiredPakete(): number {
  return getDatabase()
    .prepare(`DELETE FROM system_update_paket WHERE datetime(gueltig_bis) < datetime('now')`)
    .run().changes;
}

// --- Installierte Versionen ---

export function recordInstalledVersion(version: string, istAktiv: boolean): void {
  const db = getDatabase();
  db.transaction(() => {
    if (istAktiv) {
      db.prepare(`UPDATE system_installed_version SET ist_aktiv = 0`).run();
    }
    db.prepare(
      `INSERT INTO system_installed_version (version, ist_aktiv, rollback_verfuegbar)
       VALUES (?, ?, 1)
       ON CONFLICT(version) DO UPDATE SET ist_aktiv = excluded.ist_aktiv`,
    ).run(version, istAktiv ? 1 : 0);
  })();
}

export function listInstalledVersions(): {
  version: string; installedAt: string; istAktiv: boolean; rollbackVerfuegbar: boolean;
}[] {
  return getDatabase()
    .prepare(`SELECT version, installed_at, ist_aktiv, rollback_verfuegbar
              FROM system_installed_version ORDER BY installed_at DESC`)
    .all()
    .map((r: unknown) => {
      const row = r as { version: string; installed_at: string; ist_aktiv: number; rollback_verfuegbar: number };
      return {
        version: row.version,
        installedAt: row.installed_at,
        istAktiv: row.ist_aktiv === 1,
        rollbackVerfuegbar: row.rollback_verfuegbar === 1,
      };
    });
}

/** Beim Boot: Hängende Läufe (status='laeuft') als Fehler markieren —
 * Backend muss neu gestartet sein, also kann kein laufender Update-Prozess
 * mehr aktiv sein. Verhindert "ewig laufende" Einträge in der UI. */
export function markStaleLaeufeAlsFehler(grund = "Backend-Restart während Update"): number {
  const db = getDatabase();
  const tx = db.transaction(() => {
    const rows = db.prepare(`SELECT id FROM system_update_lauf WHERE status = 'laeuft'`).all() as { id: string }[];
    for (const r of rows) {
      db.prepare(
        `UPDATE system_update_lauf SET status='fehler', beendet_am=datetime('now'),
           fehler_text = COALESCE(fehler_text, ?) WHERE id = ?`,
      ).run(grund, r.id);
      db.prepare(
        `UPDATE system_update_step SET status='fehler', beendet_am=datetime('now'),
           fehler_text = COALESCE(fehler_text, ?) WHERE lauf_id = ? AND status = 'laeuft'`,
      ).run(grund, r.id);
    }
    return rows.length;
  });
  return tx();
}
