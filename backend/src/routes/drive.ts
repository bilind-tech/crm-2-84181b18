// /einstellungen/google-drive/* (OAuth-Flow) + /drive/uploads.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import {
  loadDriveSettings, buildAuthUrl, exchangeCode, verifyState, disconnect, setStatusError,
} from "../drive/oauth.js";
import { ensureRootFolder, createTextFile, resetDriveClient } from "../drive/folders.js";
import { listUploads, retry, type DriveUploadStatus, type BelegArt } from "../drive/upload-repo.js";
import { tickDriveQueue } from "../drive/upload-worker.js";

export async function driveRoutes(app: FastifyInstance): Promise<void> {
  // Public: nur Callback (Google ruft uns ohne Cookie auf)
  app.get("/einstellungen/google-drive/callback", async (req, reply) => {
    const q = z.object({
      code: z.string().min(1).optional(),
      state: z.string().min(1).optional(),
      error: z.string().optional(),
    }).parse(req.query ?? {});
    const redirectBase = process.env.FRONTEND_URL ?? "/";
    const redirect = (status: "ok" | "err", msg?: string): string => {
      const u = new URL("/einstellungen", redirectBase.startsWith("http") ? redirectBase : "http://localhost");
      u.searchParams.set("tab", "drive");
      u.searchParams.set("status", status);
      if (msg) u.searchParams.set("msg", msg);
      return redirectBase.startsWith("http") ? u.toString() : `${u.pathname}${u.search}`;
    };
    if (q.error) { setStatusError(q.error); return reply.redirect(redirect("err", q.error)); }
    if (!q.code || !q.state || !verifyState(q.state)) {
      return reply.redirect(redirect("err", "invalid-state"));
    }
    try {
      await exchangeCode(q.code, { protocol: req.protocol, hostname: req.hostname });
      resetDriveClient();
      return reply.redirect(redirect("ok"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
      return reply.redirect(redirect("err", msg));
    }
  });

  app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);

    scoped.get("/einstellungen/google-drive", async () => loadDriveSettings());

    scoped.post("/einstellungen/google-drive/connect", async (req, reply) => {
      try {
        const { url } = buildAuthUrl({ protocol: req.protocol, hostname: req.hostname });
        return { authorizeUrl: url };
      } catch (e) {
        reply.status(400);
        return { error: e instanceof Error ? e.message : String(e) };
      }
    });

    scoped.post("/einstellungen/google-drive/disconnect", async () => {
      disconnect();
      resetDriveClient();
      return { ok: true };
    });

    scoped.post("/einstellungen/google-drive/test", async (_req, reply) => {
      try {
        const root = await ensureRootFolder();
        const out = await createTextFile({
          parentFolderId: root,
          name: `verbindungstest-${new Date().toISOString().slice(0, 10)}.txt`,
          content: "MyCleanCenter — Verbindungstest erfolgreich.",
        });
        return { ok: true, rootOrdnerId: root, fileId: out.id, webViewLink: out.webViewLink };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setStatusError(msg);
        reply.status(500);
        return { ok: false, error: msg };
      }
    });

    scoped.get("/drive/uploads", async (req) => {
      const q = z.object({
        status: z.enum(["pending", "running", "erfolg", "fehler", "manuell"]).optional(),
        beleg_id: z.string().optional(),
        beleg_art: z.enum(["angebot", "rechnung"]).optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
        offset: z.coerce.number().int().min(0).optional(),
      }).parse(req.query ?? {});
      return listUploads({
        status: q.status as DriveUploadStatus | undefined,
        belegId: q.beleg_id, belegArt: q.beleg_art as BelegArt | undefined,
        limit: q.limit, offset: q.offset,
      });
    });
    scoped.post<{ Params: { id: string } }>("/drive/uploads/:id/retry", async (req, reply) => {
      if (!retry(req.params.id)) { reply.status(404); return { error: "not-found" }; }
      void tickDriveQueue(1).catch(() => undefined);
      return { ok: true };
    });
  });
}
