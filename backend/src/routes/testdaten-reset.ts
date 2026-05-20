// Einmaliger Testdaten-Reset: löscht Kunden, Angebote, Rechnungen, Protokolle
// und alle direkten Abhängigkeiten. Funktion sperrt sich nach erstem Erfolg
// dauerhaft via reset_state-Sentinel.
import { unlinkSync, existsSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { findeBenutzer } from "../auth/users-repo.js";
import { verifyPassword } from "../auth/password.js";
import { audit } from "../auth/audit.js";
import { getDatabase } from "../db/index.js";
import { createBackup } from "../backup/create.js";
import { absolutePath as dokAbsolutePath } from "../dokumente/storage.js";

const CONFIRM_PHRASE = "ALLES LÖSCHEN";

const Body = z.object({
  passwort: z.string().min(1).max(256),
  bestaetigung: z.string(),
});

function getSentinel(): { genutztAm: string | null } {
  const row = getDatabase()
    .prepare(`SELECT testdaten_reset_genutzt_am FROM reset_state WHERE id = 1`)
    .get() as { testdaten_reset_genutzt_am: string | null } | undefined;
  return { genutztAm: row?.testdaten_reset_genutzt_am ?? null };
}

export async function testdatenResetRoutes(app: FastifyInstance): Promise<void> {
  app.get("/testdaten-reset/status", { preHandler: requireAuth }, async () => {
    const s = getSentinel();
    return { verfuegbar: s.genutztAm === null, genutztAm: s.genutztAm };
  });

  app.post("/testdaten-reset", { preHandler: requireAuth }, async (req, reply) => {
    // 1. Sentinel
    if (getSentinel().genutztAm !== null) {
      reply.status(410).send({ error: "Testdaten-Reset wurde bereits verwendet." });
      return;
    }

    // 2. Body
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      reply.status(400).send({ error: "Ungültiger Request" });
      return;
    }
    if (parsed.data.bestaetigung !== CONFIRM_PHRASE) {
      reply.status(400).send({ error: `Bitte exakt „${CONFIRM_PHRASE}" eingeben.` });
      return;
    }

    // 3. Passwort
    const uid = req.user?.id;
    if (!uid) { reply.status(401).send({ error: "unauth" }); return; }
    const u = findeBenutzer(uid);
    if (!u) { reply.status(401).send({ error: "unauth" }); return; }
    const ok = await verifyPassword(u.password_hash, parsed.data.passwort);
    if (!ok) { reply.status(403).send({ error: "Passwort falsch" }); return; }

    // 4. Sicherheits-Backup
    try {
      await createBackup({ category: "manual", trigger: "manual" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      audit({ userId: uid, action: "testdaten-reset.backup-fail", detail: msg });
      reply.status(500).send({ error: `Sicherheits-Backup fehlgeschlagen: ${msg}` });
      return;
    }

    const db = getDatabase();
    // Sicherstellen, dass FK-Checks aktiv sind — sonst können stille Inkonsistenzen entstehen.
    db.pragma("foreign_keys = ON");

    // 5. Storage-Pfade einsammeln (vor DELETE)
    const storagePaths = (db
      .prepare(`SELECT storage_path FROM dokumente`)
      .all() as { storage_path: string }[])
      .map((r) => r.storage_path)
      .filter(Boolean);

    let counts = { kunden: 0, angebote: 0, rechnungen: 0, protokolle: 0, dokumente: 0 };

    try {
      const tx = db.transaction(() => {
        // Counts vor dem Löschen
        counts = {
          kunden: (db.prepare(`SELECT COUNT(*) AS n FROM kunde`).get() as { n: number }).n,
          angebote: (db.prepare(`SELECT COUNT(*) AS n FROM angebot`).get() as { n: number }).n,
          rechnungen: (db.prepare(`SELECT COUNT(*) AS n FROM rechnung`).get() as { n: number }).n,
          protokolle: (db.prepare(`SELECT COUNT(*) AS n FROM protokolle`).get() as { n: number }).n,
          dokumente: (db.prepare(`SELECT COUNT(*) AS n FROM dokumente`).get() as { n: number }).n,
        };

        // Kinder zuerst
        db.exec(`
          DELETE FROM dauerauftrag_sonderposition;
          DELETE FROM dauerauftrag_lauf;
          DELETE FROM dauerauftrag;
          DELETE FROM zahlung;
          DELETE FROM mahn_lauf_eintraege;
          DELETE FROM mahn_laeufe;
          DELETE FROM email_versand WHERE beleg_art IN ('angebot','rechnung','protokoll');
          DELETE FROM drive_upload_queue WHERE beleg_art IN ('angebot','rechnung','protokoll');
          DELETE FROM dokumente_frist_benachrichtigung_log;
          DELETE FROM dokumente;
          DELETE FROM upload_sessions;
          DELETE FROM protokolle;
          DELETE FROM rechnung;
          DELETE FROM angebot;
          DELETE FROM notiz;
          DELETE FROM ansprechpartner;
          DELETE FROM objekt;
          DELETE FROM kunde;
          DELETE FROM aktivitaet;
          DELETE FROM benachrichtigung;
          DELETE FROM belegnummer_zaehler_v2;
          DELETE FROM belegnummer_reserviert;
          DELETE FROM kunde_nummer_zaehler;
          DELETE FROM objekt_nummer_zaehler;
        `);

        // Sentinel setzen
        db.prepare(
          `UPDATE reset_state
             SET testdaten_reset_genutzt_am = datetime('now'),
                 testdaten_reset_von_user_id = ?
           WHERE id = 1`,
        ).run(uid);
      });
      tx();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      audit({ userId: uid, action: "testdaten-reset.fail", detail: msg });
      reply.status(500).send({ error: `Reset fehlgeschlagen: ${msg}` });
      return;
    }

    // 6. Dateien entlinken (best effort, nach Commit)
    for (const sp of storagePaths) {
      try {
        const abs = dokAbsolutePath(sp);
        if (existsSync(abs)) unlinkSync(abs);
      } catch (e) {
        app.log.warn({ err: e, sp }, "testdaten-reset: datei-cleanup fehlgeschlagen");
      }
    }

    audit({ userId: uid, action: "testdaten-reset.success", detail: counts });
    reply.send({ geloescht: counts });
  });
}
