// REST-Routen für Protokolle (Übergabe/Abnahme + Schlüssel).
//   GET    /protokolle?kind=&kundeId=
//   POST   /protokolle                          (JSON: vollständiger Datensatz, ohne id/nummer)
//   GET    /protokolle/:id
//   PATCH  /protokolle/:id                      (JSON-Patch, nur im Entwurf)
//   DELETE /protokolle/:id
//   POST   /protokolle/:id/abschliessen         (Multipart: file=PDF + meta=JSON{dateiname})
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/middleware.js";
import {
  abschliessenProtokoll, createProtokoll, deleteProtokoll, getProtokoll, getProtokollByDokumentId,
  listProtokolle, updateProtokoll, type CreateInput, type ProtokollKind,
} from "../protokolle/repo.js";

const KINDS: ProtokollKind[] = ["uebergabe", "schluessel"];

export async function protokolleRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { kind?: string; kundeId?: string } }>(
    "/protokolle",
    { preHandler: requireAuth },
    async (req) => {
      const { kind, kundeId } = req.query ?? {};
      const k = kind && KINDS.includes(kind as ProtokollKind) ? (kind as ProtokollKind) : undefined;
      return listProtokolle({ kind: k, kundeId });
    },
  );

  app.post<{ Body: CreateInput }>(
    "/protokolle",
    { preHandler: requireAuth },
    async (req, reply) => {
      const body = req.body ?? ({} as CreateInput);
      if (!body.kind || !KINDS.includes(body.kind)) {
        reply.status(400).send({ error: "kind required" });
        return;
      }
      return createProtokoll(body);
    },
  );

  app.get<{ Params: { dokumentId: string } }>(
    "/protokolle/by-dokument/:dokumentId",
    { preHandler: requireAuth },
    async (req, reply) => {
      const p = getProtokollByDokumentId(req.params.dokumentId);
      if (!p) { reply.status(404).send({ error: "not found" }); return; }
      return p;
    },
  );

  app.get<{ Params: { id: string } }>(
    "/protokolle/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const p = getProtokoll(req.params.id);
      if (!p) { reply.status(404).send({ error: "not found" }); return; }
      return p;
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<CreateInput> }>(
    "/protokolle/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      try {
        const p = updateProtokoll(req.params.id, req.body ?? {});
        if (!p) { reply.status(404).send({ error: "not found" }); return; }
        return p;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode ?? 500;
        reply.status(status).send({ error: e instanceof Error ? e.message : "error" });
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/protokolle/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const ok = deleteProtokoll(req.params.id);
      if (!ok) { reply.status(404).send({ error: "not found" }); return; }
      reply.status(204).send();
    },
  );

  // Multipart: file=PDF + meta=JSON{dateiname}
  app.post<{ Params: { id: string } }>(
    "/protokolle/:id/abschliessen",
    { preHandler: requireAuth },
    async (req, reply) => {
      const cur = getProtokoll(req.params.id);
      if (!cur) { reply.status(404).send({ error: "not found" }); return; }

      const ct = req.headers["content-type"] ?? "";
      let pdfBuffer: Buffer | null = null;
      let dateiname = `${cur.nummer.replace("/", "-")}.pdf`;

      if (ct.startsWith("multipart/")) {
        const parts = (req as unknown as { parts: () => AsyncIterable<unknown> }).parts();
        for await (const partRaw of parts) {
          const part = partRaw as {
            type: "file" | "field"; fieldname: string; filename?: string;
            file?: NodeJS.ReadableStream; value?: string;
          };
          if (part.type === "file" && part.file) {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) chunks.push(chunk as Buffer);
            pdfBuffer = Buffer.concat(chunks);
            if (part.filename) dateiname = part.filename;
          } else if (part.type === "field" && part.fieldname === "meta" && typeof part.value === "string") {
            try {
              const m = JSON.parse(part.value) as { dateiname?: string };
              if (m.dateiname) dateiname = m.dateiname;
            } catch { /* ignore */ }
          }
        }
      } else {
        // JSON-Fallback: { pdfBase64, dateiname }
        const body = (req.body ?? {}) as { pdfBase64?: string; dateiname?: string };
        if (body.pdfBase64) {
          const b64 = body.pdfBase64.includes(",") ? body.pdfBase64.split(",")[1] : body.pdfBase64;
          pdfBuffer = Buffer.from(b64, "base64");
        }
        if (body.dateiname) dateiname = body.dateiname;
      }

      if (!pdfBuffer || pdfBuffer.length === 0) {
        reply.status(400).send({ error: "PDF fehlt (file oder pdfBase64)" });
        return;
      }
      const result = await abschliessenProtokoll(req.params.id, { pdfBuffer, dateiname });
      if (!result) { reply.status(404).send({ error: "not found" }); return; }
      return result;
    },
  );
}
