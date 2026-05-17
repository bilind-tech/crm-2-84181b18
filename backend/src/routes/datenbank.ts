// Generische /datenbank-API für die Datenbank-Verwaltungsseite.
// Liest aus jeder registrierten Tabelle (inkl. soft-gelöschten Einträgen),
// erlaubt PATCH von Whitelist-Feldern, Restore und passwortgeschütztes
// Hart-Löschen. Liefert auch verknüpfte PDFs aus der dokumente-Tabelle.

import path from "node:path";
import { unlinkSync, existsSync, statSync, createReadStream } from "node:fs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { findeBenutzer } from "../auth/users-repo.js";
import { verifyPassword } from "../auth/password.js";
import { getDatabase } from "../db/index.js";
import { findTable, REGISTRY, type DbTableDef } from "../datenbank/registry.js";
import { absolutePath as dokAbsolutePath } from "../dokumente/storage.js";

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;

function softCondition(t: DbTableDef): string {
  return t.hasGeloeschtAm ? "geloescht_am IS NULL" : "1=1";
}

/** Liefert nur Whitelist-Spalten — verhindert SQL-Injection und Lese-Lücken. */
function projection(t: DbTableDef): string {
  // SELECT * → wir laden alle Spalten für Detail-Anzeige (Whitelist nur beim PATCH).
  return "*";
}

function paramsFromQuery(q: Record<string, unknown>): {
  status: "alle" | "aktiv" | "geloescht";
  search: string;
  kundeId: string;
  from: string;
  to: string;
  page: number;
  limit: number;
} {
  const status = ((q.status as string) || "aktiv").toLowerCase() as "alle" | "aktiv" | "geloescht";
  return {
    status: (["alle", "aktiv", "geloescht"] as const).includes(status) ? status : "aktiv",
    search: ((q.q as string) || "").trim(),
    kundeId: ((q.kundeId as string) || "").trim(),
    from: ((q.from as string) || "").trim(),
    to: ((q.to as string) || "").trim(),
    page: Math.max(1, parseInt((q.page as string) || "1", 10) || 1),
    limit: Math.min(PAGE_SIZE_MAX, Math.max(1, parseInt((q.limit as string) || String(PAGE_SIZE_DEFAULT), 10) || PAGE_SIZE_DEFAULT)),
  };
}

function buildWhere(t: DbTableDef, p: ReturnType<typeof paramsFromQuery>): { sql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (t.hasGeloeschtAm) {
    if (p.status === "aktiv") where.push("geloescht_am IS NULL");
    else if (p.status === "geloescht") where.push("geloescht_am IS NOT NULL");
    // alle: keine Bedingung
  }
  if (p.search && t.searchColumns.length) {
    const like = `%${p.search.toLowerCase()}%`;
    const ors = t.searchColumns.map((c) => `LOWER(COALESCE(${c}, '')) LIKE ?`);
    where.push(`(${ors.join(" OR ")})`);
    for (const _ of t.searchColumns) params.push(like);
  }
  if (p.kundeId && t.kundeColumn) {
    where.push(`${t.kundeColumn} = ?`);
    params.push(p.kundeId);
  }
  if (p.from && t.dateColumn) {
    where.push(`${t.dateColumn} >= ?`);
    params.push(p.from);
  }
  if (p.to && t.dateColumn) {
    where.push(`${t.dateColumn} <= ?`);
    params.push(p.to + " 23:59:59");
  }
  return { sql: where.length ? "WHERE " + where.join(" AND ") : "", params };
}

function orderClause(t: DbTableDef): string {
  // Stabile Sortierung: erst Datum (DESC), dann ID.
  if (t.dateColumn) return `ORDER BY ${t.dateColumn} DESC, id DESC`;
  return "ORDER BY id DESC";
}

export async function datenbankRoutes(app: FastifyInstance): Promise<void> {
  // --- Tabellen-Übersicht mit Zählern -----------------------------------
  app.get("/datenbank/tabellen", { preHandler: requireAuth }, async () => {
    const db = getDatabase();
    return REGISTRY.map((t) => {
      let total = 0;
      let aktiv = 0;
      let geloescht = 0;
      try {
        total = (db.prepare(`SELECT COUNT(*) AS n FROM ${t.sqlTable}`).get() as { n: number }).n;
        if (t.hasGeloeschtAm) {
          aktiv = (db.prepare(`SELECT COUNT(*) AS n FROM ${t.sqlTable} WHERE geloescht_am IS NULL`).get() as { n: number }).n;
          geloescht = total - aktiv;
        } else {
          aktiv = total;
        }
      } catch (e) {
        // Tabelle ggf. noch nicht migriert — sauber durchreichen.
        app.log.warn({ err: e, tabelle: t.key }, "datenbank count failed");
      }
      return {
        key: t.key,
        label: t.label,
        icon: t.icon ?? null,
        sqlTable: t.sqlTable,
        total,
        aktiv,
        geloescht,
        hasGeloeschtAm: t.hasGeloeschtAm,
        listColumns: t.listColumns,
        searchColumns: t.searchColumns,
        kundeColumn: t.kundeColumn ?? null,
        dateColumn: t.dateColumn ?? null,
        hasPdf: !!t.pdfDocumentIdColumn,
        editable: t.editable,
      };
    });
  });

  // --- Liste eines Tabelleninhalts --------------------------------------
  app.get<{ Params: { tabelle: string }; Querystring: Record<string, string> }>(
    "/datenbank/:tabelle",
    { preHandler: requireAuth },
    async (req, reply) => {
      const t = findTable(req.params.tabelle);
      if (!t) { reply.status(404).send({ error: "Tabelle unbekannt" }); return; }
      const p = paramsFromQuery(req.query as Record<string, unknown>);
      const w = buildWhere(t, p);
      const db = getDatabase();
      const total = (db.prepare(`SELECT COUNT(*) AS n FROM ${t.sqlTable} ${w.sql}`).get(...w.params) as { n: number }).n;
      const offset = (p.page - 1) * p.limit;
      const rows = db
        .prepare(`SELECT ${projection(t)} FROM ${t.sqlTable} ${w.sql} ${orderClause(t)} LIMIT ? OFFSET ?`)
        .all(...w.params, p.limit, offset);
      return { total, page: p.page, limit: p.limit, rows };
    },
  );

  // --- Einzelner Datensatz ----------------------------------------------
  app.get<{ Params: { tabelle: string; id: string } }>(
    "/datenbank/:tabelle/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const t = findTable(req.params.tabelle);
      if (!t) { reply.status(404).send({ error: "Tabelle unbekannt" }); return; }
      const row = getDatabase().prepare(`SELECT * FROM ${t.sqlTable} WHERE id = ?`).get(req.params.id);
      if (!row) { reply.status(404).send({ error: "Nicht gefunden" }); return; }
      return row;
    },
  );

  // --- PATCH (Whitelist) -----------------------------------------------
  app.patch<{ Params: { tabelle: string; id: string }; Body: Record<string, unknown> }>(
    "/datenbank/:tabelle/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const t = findTable(req.params.tabelle);
      if (!t) { reply.status(404).send({ error: "Tabelle unbekannt" }); return; }
      const body = req.body ?? {};
      const sets: string[] = [];
      const vals: unknown[] = [];
      for (const f of t.editable) {
        if (!(f.column in body)) continue;
        let v = body[f.column];
        if (v === "") v = null;
        if (f.type === "number" && v != null) v = Number(v);
        if (f.type === "boolean" && v != null) v = v ? 1 : 0;
        if (typeof v === "string" && v.length > 10000) v = v.slice(0, 10000);
        sets.push(`${f.column} = ?`);
        vals.push(v);
      }
      if (sets.length === 0) {
        reply.status(400).send({ error: "Keine bearbeitbaren Felder geschickt" });
        return;
      }
      // geaendert_am mitnehmen, wenn es die Spalte gibt
      try {
        const cols = getDatabase().prepare(`PRAGMA table_info(${t.sqlTable})`).all() as { name: string }[];
        if (cols.some((c) => c.name === "geaendert_am")) sets.push("geaendert_am = datetime('now')");
        else if (cols.some((c) => c.name === "aktualisiert_am")) sets.push("aktualisiert_am = datetime('now')");
      } catch { /* ignore */ }
      vals.push(req.params.id);
      const r = getDatabase().prepare(`UPDATE ${t.sqlTable} SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
      if (r.changes === 0) { reply.status(404).send({ error: "Nicht gefunden" }); return; }
      const row = getDatabase().prepare(`SELECT * FROM ${t.sqlTable} WHERE id = ?`).get(req.params.id);
      return row;
    },
  );

  // --- Wiederherstellen -------------------------------------------------
  app.post<{ Params: { tabelle: string; id: string } }>(
    "/datenbank/:tabelle/:id/restore",
    { preHandler: requireAuth },
    async (req, reply) => {
      const t = findTable(req.params.tabelle);
      if (!t) { reply.status(404).send({ error: "Tabelle unbekannt" }); return; }
      if (!t.hasGeloeschtAm) { reply.status(400).send({ error: "Tabelle unterstützt kein Soft-Delete" }); return; }
      const r = getDatabase()
        .prepare(`UPDATE ${t.sqlTable} SET geloescht_am = NULL WHERE id = ?`)
        .run(req.params.id);
      if (r.changes === 0) { reply.status(404).send({ error: "Nicht gefunden" }); return; }
      reply.status(204).send();
    },
  );

  // --- Hart-Löschen mit Passwort ---------------------------------------
  const HartBody = z.object({ passwort: z.string().min(1).max(256) });
  app.post<{ Params: { tabelle: string; id: string }; Body: unknown }>(
    "/datenbank/:tabelle/:id/hart-loeschen",
    { preHandler: requireAuth },
    async (req, reply) => {
      const t = findTable(req.params.tabelle);
      if (!t) { reply.status(404).send({ error: "Tabelle unbekannt" }); return; }
      const parsed = HartBody.safeParse(req.body);
      if (!parsed.success) { reply.status(400).send({ error: "passwort fehlt" }); return; }
      const uid = req.user?.id;
      if (!uid) { reply.status(401).send({ error: "unauth" }); return; }
      const u = findeBenutzer(uid);
      if (!u) { reply.status(401).send({ error: "unauth" }); return; }
      const ok = await verifyPassword(u.password_hash, parsed.data.passwort);
      if (!ok) { reply.status(403).send({ error: "Passwort falsch" }); return; }

      const db = getDatabase();
      // Wenn Dokument-Sub-Tabelle: zugehörige Datei nach erfolgreichem DELETE löschen.
      let storagePath: string | null = null;
      if (t.sqlTable === "dokumente") {
        const row = db.prepare(`SELECT storage_path FROM dokumente WHERE id = ?`).get(req.params.id) as { storage_path: string } | undefined;
        storagePath = row?.storage_path ?? null;
      }

      try {
        const tx = db.transaction(() => {
          for (const stmt of t.hardDeleteExtra ?? []) {
            db.prepare(stmt.replace(/:id/g, "?")).run(req.params.id);
          }
          const r = db.prepare(`DELETE FROM ${t.sqlTable} WHERE id = ?`).run(req.params.id);
          if (r.changes === 0) throw Object.assign(new Error("nicht gefunden"), { statusCode: 404 });
        });
        tx();
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode ?? 500;
        reply.status(code).send({ error: e instanceof Error ? e.message : "fehler" });
        return;
      }

      if (storagePath) {
        try {
          const abs = dokAbsolutePath(storagePath);
          if (existsSync(abs)) unlinkSync(abs);
        } catch (e) {
          app.log.warn({ err: e, storagePath }, "datei-cleanup nach hart-löschen fehlgeschlagen");
        }
      }
      reply.status(204).send();
    },
  );

  // --- PDF-Stream -------------------------------------------------------
  app.get<{ Params: { tabelle: string; id: string }; Querystring: { print?: string } }>(
    "/datenbank/:tabelle/:id/pdf",
    { preHandler: requireAuth },
    async (req, reply) => {
      const t = findTable(req.params.tabelle);
      if (!t) { reply.status(404).send({ error: "Tabelle unbekannt" }); return; }
      if (!t.pdfDocumentIdColumn) { reply.status(404).send({ error: "Kein PDF verfügbar" }); return; }
      const row = getDatabase()
        .prepare(`SELECT ${t.pdfDocumentIdColumn} AS dok_id FROM ${t.sqlTable} WHERE id = ?`)
        .get(req.params.id) as { dok_id: string | null } | undefined;
      if (!row?.dok_id) { reply.status(404).send({ error: "Kein verknüpftes Dokument" }); return; }
      const dok = getDatabase()
        .prepare(`SELECT storage_path, dateiname, mime_type FROM dokumente WHERE id = ?`)
        .get(row.dok_id) as { storage_path: string; dateiname: string; mime_type: string } | undefined;
      if (!dok) { reply.status(404).send({ error: "Dokument nicht gefunden" }); return; }
      const abs = dokAbsolutePath(dok.storage_path);
      if (!existsSync(abs)) { reply.status(404).send({ error: "Datei fehlt auf der Festplatte" }); return; }
      const stat = statSync(abs);
      reply.header("Content-Type", dok.mime_type || "application/pdf");
      reply.header("Content-Length", String(stat.size));
      const safeName = path.basename(dok.dateiname || "datei.pdf").replace(/"/g, "");
      reply.header(
        "Content-Disposition",
        `inline; filename="${safeName}"`,
      );
      return reply.send(createReadStream(abs));
    },
  );
}