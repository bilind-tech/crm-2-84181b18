// REST-Routen für Dokumente + Upload-Sessions.
//
// Dokumente:
//   GET    /dokumente                       (Liste, Filter via Query)
//   GET    /dokumente/:id                   (Metadaten)
//   GET    /dokumente/:id/datei             (Binary-Stream)
//   POST   /dokumente                       (Multipart: file=datei + meta=JSON)
//   PATCH  /dokumente/:id                   (Metadaten ändern)
//   POST   /dokumente/:id/erledigt          (Erledigt-Marker setzen/entfernen)
//   DELETE /dokumente/:id                   (Soft-Delete)
//   POST   /dokumente/check-fristen         (Frist-Cron manuell anstoßen)
//
// Upload-Sessions (für Handy-Scan):
//   POST   /upload-sessions                 (Session anlegen, mit Auth)
//   GET    /upload-sessions/:token          (Session validieren, Token-only)
//   POST   /upload-sessions/:token/dokumente (Multipart-Upload, Token-only)
//   POST   /upload-sessions/:id/beenden     (Session schließen, mit Auth)
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/middleware.js";
import { audit } from "../auth/audit.js";
import { emit } from "../events/bus.js";
import {
  createDokument, deleteFile as _unused, // typecheck
  endSession, getDokument, getDokumentRaw, getSessionById, getSessionByToken,
  isSessionUploadable, listDokumente, refsForSha, softDeleteDokument, updateDokument,
  createSession,
} from "../dokumente/repo.js";
import { storeBuffer, openReadStream, fileExists, deleteFile, fileSize } from "../dokumente/storage.js";
import {
  DokumentListFilterSchema, DokumentMetaInputSchema, DokumentPatchSchema,
  UploadSessionInputSchema,
} from "../dokumente/validation.js";
import { isAllowedMime, MAX_UPLOAD_BYTES } from "../dokumente/types.js";
import type { DokumentTyp, DokumentQuelle } from "../dokumente/types.js";
import { runFristCheck } from "../dokumente/fristen-cron.js";
// Avoid unused
void _unused;

interface ParsedUpload {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  meta: Record<string, unknown>;
  truncated: boolean;
}

async function parseMultipart(req: import("fastify").FastifyRequest): Promise<ParsedUpload | null> {
  const parts = (req as unknown as { parts: () => AsyncIterable<unknown> }).parts();
  let file: { buffer: Buffer; filename: string; mimeType: string; truncated: boolean } | null = null;
  let meta: Record<string, unknown> = {};
  for await (const partRaw of parts) {
    const part = partRaw as {
      type: "file" | "field";
      fieldname: string;
      filename?: string;
      mimetype?: string;
      file?: NodeJS.ReadableStream & { truncated: boolean };
      value?: string;
    };
    if (part.type === "file" && part.file) {
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of part.file) {
        const buf = chunk as Buffer;
        total += buf.length;
        if (total > MAX_UPLOAD_BYTES) {
          // weiterlesen, damit Stream nicht hängt — wir verwerfen den Upload
        } else {
          chunks.push(buf);
        }
      }
      file = {
        buffer: Buffer.concat(chunks),
        filename: part.filename ?? "datei",
        mimeType: part.mimetype ?? "application/octet-stream",
        truncated: total > MAX_UPLOAD_BYTES || !!part.file.truncated,
      };
    } else if (part.type === "field" && part.fieldname === "meta" && typeof part.value === "string") {
      try { meta = JSON.parse(part.value) as Record<string, unknown>; } catch { meta = {}; }
    }
  }
  if (!file) return null;
  return { ...file, meta };
}

function ableitenTyp(mime: string, fallback?: DokumentTyp): DokumentTyp {
  if (fallback) return fallback;
  if (mime.startsWith("image/")) return "bild";
  if (mime === "application/pdf") return "rechnung";
  return "sonstiges";
}

export async function dokumenteRoutes(app: FastifyInstance): Promise<void> {
  // ---------- Liste / Detail ----------
  app.get("/dokumente", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = DokumentListFilterSchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    return listDokumente(parsed.data);
  });

  app.get<{ Params: { id: string } }>(
    "/dokumente/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const d = getDokument(req.params.id);
      if (!d) return reply.code(404).send({ error: "not-found" });
      return d;
    },
  );

  // ---------- Datei-Stream ----------
  app.get<{ Params: { id: string } }>(
    "/dokumente/:id/datei",
    { preHandler: requireAuth },
    async (req, reply) => {
      const d = getDokument(req.params.id);
      if (!d) return reply.code(404).send({ error: "not-found" });
      const raw = getDokumentRaw(req.params.id);
      if (!raw || !fileExists(raw.storage_path)) {
        return reply.code(410).send({ error: "datei-fehlt" });
      }
      reply
        .header("Content-Type", d.mimeType)
        .header("Content-Length", fileSize(raw.storage_path))
        .header(
          "Content-Disposition",
          `inline; filename="${encodeURIComponent(d.dateiname)}"`,
        )
        .header("Cache-Control", "private, max-age=3600");
      return reply.send(openReadStream(raw.storage_path));
    },
  );

  // ---------- Upload (Multipart) ----------
  app.post(
    "/dokumente",
    { preHandler: requireAuth, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (!req.isMultipart()) {
        return reply.code(400).send({ error: "multipart-required" });
      }
      const parsed = await parseMultipart(req);
      if (!parsed) return reply.code(400).send({ error: "no-file" });
      if (parsed.truncated) return reply.code(413).send({ error: "file-too-large", maxBytes: MAX_UPLOAD_BYTES });
      if (!isAllowedMime(parsed.mimeType)) {
        return reply.code(415).send({ error: "mime-not-allowed", mime: parsed.mimeType });
      }
      const metaParsed = DokumentMetaInputSchema.safeParse(parsed.meta ?? {});
      if (!metaParsed.success) {
        return reply.code(400).send({ error: "validation", issues: metaParsed.error.issues });
      }
      const meta = metaParsed.data;

      const stored = await storeBuffer(parsed.buffer, parsed.mimeType, parsed.filename);
      const created = createDokument({
        titel: meta.titel ?? parsed.filename,
        beschreibung: meta.beschreibung ?? null,
        typ: ableitenTyp(parsed.mimeType, meta.typ),
        kundeId: meta.kundeId ?? null,
        objektId: meta.objektId ?? null,
        uploadSessionId: meta.uploadSessionId ?? null,
        dateiname: parsed.filename,
        mimeType: parsed.mimeType,
        groesseBytes: stored.groesseBytes,
        sha256: stored.sha256,
        storagePath: stored.storagePath,
        dokumentdatum: meta.dokumentdatum ?? null,
        betrag: meta.betrag ?? null,
        steuerrelevant: meta.steuerrelevant ?? false,
        ustSatz: meta.ustSatz ?? null,
        faelligAm: meta.faelligAm ?? null,
        quelle: (meta.quelle as DokumentQuelle | undefined) ?? "upload",
      });

      audit({
        userId: req.user?.id ?? null,
        action: "dokument.upload",
        detail: { id: created.id, mime: parsed.mimeType, size: stored.groesseBytes, sha: stored.sha256 },
      });
      emit("aktivitaet:neu", {
        id: created.id, art: "dokument_hochgeladen",
        bezugArt: "dokument", bezugId: created.id,
        titel: `Dokument hochgeladen: ${created.titel}`,
        zeitpunkt: created.hochgeladenAm,
      });
      return reply.code(201).send(created);
    },
  );

  // ---------- Patch ----------
  app.patch<{ Params: { id: string } }>(
    "/dokumente/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const parsed = DokumentPatchSchema.safeParse(req.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
      const next = updateDokument(req.params.id, parsed.data);
      if (!next) return reply.code(404).send({ error: "not-found" });
      emit("aktivitaet:neu", {
        id: next.id, art: "dokument_geaendert",
        bezugArt: "dokument", bezugId: next.id,
        titel: `Dokument geändert: ${next.titel}`,
        zeitpunkt: new Date().toISOString().slice(0, 19) + "Z",
      });
      return next;
    },
  );

  // ---------- Erledigt-Toggle ----------
  app.post<{ Params: { id: string }; Body: { erledigt?: boolean } }>(
    "/dokumente/:id/erledigt",
    { preHandler: requireAuth },
    async (req, reply) => {
      const erledigt = req.body?.erledigt !== false;
      const next = updateDokument(req.params.id, { erledigt });
      if (!next) return reply.code(404).send({ error: "not-found" });
      return next;
    },
  );

  // ---------- Soft-Delete ----------
  app.delete<{ Params: { id: string } }>(
    "/dokumente/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const raw = getDokumentRaw(req.params.id);
      if (!raw) return reply.code(404).send({ error: "not-found" });
      const ok = softDeleteDokument(req.params.id);
      if (!ok) return reply.code(404).send({ error: "not-found" });
      // Wenn keine andere Zeile mehr referenziert: Datei direkt entfernen.
      if (refsForSha(raw.sha256) === 0) deleteFile(raw.storage_path);
      audit({
        userId: req.user?.id ?? null,
        action: "dokument.delete",
        detail: { id: req.params.id },
      });
      return reply.code(204).send();
    },
  );

  // ---------- Frist-Cron manuell ----------
  app.post("/dokumente/check-fristen", { preHandler: requireAuth }, async () => {
    return runFristCheck();
  });

  // ---------- Upload-Sessions: Auth-pflichtig ----------
  app.post("/upload-sessions", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = UploadSessionInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    const sess = createSession(parsed.data);
    return reply.code(201).send(sess);
  });

  app.post<{ Params: { id: string } }>(
    "/upload-sessions/:id/beenden",
    { preHandler: requireAuth },
    async (req, reply) => {
      const ok = endSession(req.params.id);
      if (!ok) return reply.code(404).send({ error: "not-found" });
      return reply.code(204).send();
    },
  );

  // ---------- Upload-Sessions: Token-only ----------
  app.get<{ Params: { token: string } }>(
    "/upload-sessions/:token",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const s = getSessionByToken(req.params.token);
      if (!s) return reply.code(404).send({ error: "not-found" });
      return {
        token: s.token, kundeId: s.kundeId, objektId: s.objektId,
        ablaufAm: s.ablaufAm, beendet: s.beendet, dokumentIds: s.dokumentIds,
      };
    },
  );

  app.post<{ Params: { token: string } }>(
    "/upload-sessions/:token/dokumente",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const sess = getSessionByToken(req.params.token);
      if (!sess) return reply.code(404).send({ error: "session-not-found" });
      if (!isSessionUploadable(sess)) return reply.code(410).send({ error: "session-expired-or-ended" });
      if (!req.isMultipart()) return reply.code(400).send({ error: "multipart-required" });
      const parsed = await parseMultipart(req);
      if (!parsed) return reply.code(400).send({ error: "no-file" });
      if (parsed.truncated) return reply.code(413).send({ error: "file-too-large", maxBytes: MAX_UPLOAD_BYTES });
      if (!isAllowedMime(parsed.mimeType)) {
        return reply.code(415).send({ error: "mime-not-allowed", mime: parsed.mimeType });
      }
      const stored = await storeBuffer(parsed.buffer, parsed.mimeType, parsed.filename);
      const created = createDokument({
        titel: parsed.filename,
        typ: ableitenTyp(parsed.mimeType),
        kundeId: sess.kundeId ?? null,
        objektId: sess.objektId ?? null,
        uploadSessionId: sess.id,
        dateiname: parsed.filename,
        mimeType: parsed.mimeType,
        groesseBytes: stored.groesseBytes,
        sha256: stored.sha256,
        storagePath: stored.storagePath,
        quelle: "handy-scan",
      });
      emit("aktivitaet:neu", {
        id: created.id, art: "dokument_hochgeladen",
        bezugArt: "dokument", bezugId: created.id,
        titel: `Handy-Scan: ${created.titel}`,
        zeitpunkt: created.hochgeladenAm,
      });
      return reply.code(201).send(created);
    },
  );
}
