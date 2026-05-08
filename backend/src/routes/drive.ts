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
import { getSetting, setSetting } from "../settings/store.js";
import { GoogleDriveSchema, SENSITIVE_KEYS, type GoogleDriveSettings } from "../settings/schemas.js";
import { emit } from "../events/bus.js";
import { config } from "../config.js";

interface DriveResponse {
  // Form, die das Frontend (GoogleDriveEinstellungen) erwartet
  verbunden: boolean;
  kontoEmail?: string;
  verbundenAm?: string;
  rootOrdnerName: string;
  rootOrdnerId?: string;
  unterordnerSchema: {
    rechnungen: string;
    angebote: string;
    dokumente: string;
    protokollUebergabe: string;
    protokollSchluessel: string;
  };
  dateinameSchema: { rechnung: string; angebot: string; protokoll: string };
  autoUpload: boolean;
  letzteSynchronisation?: string;
  letzterFehler?: string;
  // Diagnose-Felder (intern, schadet aber nicht im Frontend)
  clientId?: string;
  clientIdIsSet: boolean;
  clientSecretIsSet: boolean;
  refreshTokenIsSet: boolean;
  redirectUri: string;
}

const DEFAULT_FOLDERS = {
  rechnungen: "Rechnungen/{YYYY}/{MM}",
  angebote: "Angebote/{YYYY}/{MM}",
  dokumente: "Dokumente/{YYYY}/{MM}",
  protokollUebergabe: "Protokolle/Übergabe-Abnahme/{YYYY}/{MM}",
  protokollSchluessel: "Protokolle/Schlüsselübergabe/{YYYY}/{MM}",
};
const DEFAULT_FILES = {
  rechnung: "{nummer} {kunde} {leistung} {MM}-{YYYY}",
  angebot: "{nummer} {kunde} {leistung} {MM}-{YYYY}",
  protokoll: "{nummer} {kunde} {leistung} {DD}-{MM}-{YYYY}",
};

function defaultRedirectUri(req?: { protocol?: string; hostname?: string }): string {
  const fromCfg = process.env.GOOGLE_OAUTH_REDIRECT;
  if (fromCfg) return fromCfg;
  const proto = req?.protocol ?? "http";
  const host = req?.hostname ?? `localhost:${config.port}`;
  return `${proto}://${host}/einstellungen/google-drive/callback`;
}

function buildResponse(req?: { protocol?: string; hostname?: string }): DriveResponse {
  const s = loadDriveSettings();
  return {
    verbunden: s.refreshTokenIsSet,
    kontoEmail: s.kontoEmail,
    verbundenAm: undefined,
    rootOrdnerName: s.rootFolderName ?? "mycleancenter.cm",
    rootOrdnerId: s.rootOrdnerId,
    unterordnerSchema: { ...DEFAULT_FOLDERS, ...(s.unterordnerSchema ?? {}) },
    dateinameSchema: { ...DEFAULT_FILES, ...(s.dateinameSchema ?? {}) },
    autoUpload: s.autoUpload ?? true,
    letzteSynchronisation: s.letzteSynchronisation,
    letzterFehler: s.letzterFehler,
    clientId: s.clientId,
    clientIdIsSet: !!s.clientId,
    clientSecretIsSet: s.clientSecretIsSet,
    refreshTokenIsSet: s.refreshTokenIsSet,
    redirectUri: defaultRedirectUri(req),
  };
}

const PatchBodySchema = z.object({
  clientId: z.string().trim().max(500).optional(),
  clientSecret: z.string().trim().max(500).optional(),
  rootOrdnerName: z.string().trim().min(1).max(100).optional(),
  unterordnerSchema: z.object({
    rechnungen: z.string().trim().min(1).max(200),
    angebote: z.string().trim().min(1).max(200),
    dokumente: z.string().trim().min(1).max(200),
    protokollUebergabe: z.string().trim().min(1).max(200),
    protokollSchluessel: z.string().trim().min(1).max(200),
  }).partial().optional(),
  dateinameSchema: z.object({
    rechnung: z.string().trim().min(1).max(200),
    angebot: z.string().trim().min(1).max(200),
    protokoll: z.string().trim().min(1).max(200),
  }).partial().optional(),
  autoUpload: z.coerce.boolean().optional(),
}).strict();

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
      // Geräteübergreifende Live-Aktualisierung: alle verbundenen Clients
      // invalidieren ihren Drive-Status sofort via SSE.
      emit("einstellung:geaendert", { key: "googleDrive", userId: null });
      return reply.redirect(redirect("ok"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
      emit("einstellung:geaendert", { key: "googleDrive", userId: null });
      return reply.redirect(redirect("err", msg));
    }
  });

  app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);

    scoped.get("/einstellungen/google-drive", async (req) =>
      buildResponse({ protocol: req.protocol, hostname: req.hostname }),
    );

    scoped.patch("/einstellungen/google-drive", async (req, reply) => {
      const parsed = PatchBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        reply.status(422);
        return { error: "validation", issues: parsed.error.issues };
      }
      const body = parsed.data;
      // Secret separat in verschlüsseltem Setting
      if (body.clientSecret !== undefined && body.clientSecret.length > 0) {
        setSetting(SENSITIVE_KEYS.googleClientSecret, body.clientSecret, { encrypt: true });
      }
      // Restliche Felder ins googleDrive-Setting mergen
      const cur = (getSetting<GoogleDriveSettings>("googleDrive") ?? {}) as Partial<GoogleDriveSettings>;
      const merged: Partial<GoogleDriveSettings> = {
        clientId: body.clientId ?? cur.clientId ?? "",
        rootFolderName: body.rootOrdnerName ?? cur.rootFolderName ?? "mycleancenter.cm",
        unterordnerSchema: {
          ...DEFAULT_FOLDERS,
          ...(cur.unterordnerSchema ?? {}),
          ...(body.unterordnerSchema ?? {}),
        } as GoogleDriveSettings["unterordnerSchema"],
        dateinameSchema: {
          ...DEFAULT_FILES,
          ...(cur.dateinameSchema ?? {}),
          ...(body.dateinameSchema ?? {}),
        } as GoogleDriveSettings["dateinameSchema"],
        autoUpload: body.autoUpload ?? cur.autoUpload ?? true,
      };
      // Schema-Validierung für Defaults
      const v = GoogleDriveSchema.safeParse(merged);
      if (!v.success) {
        reply.status(422);
        return { error: "validation", issues: v.error.issues };
      }
      setSetting("googleDrive", v.data);
      // Settings-Cache des Drive-Clients invalidieren
      resetDriveClient();
      emit("einstellung:geaendert", { key: "googleDrive", userId: req.user?.id ?? null });
      return buildResponse({ protocol: req.protocol, hostname: req.hostname });
    });

    scoped.post("/einstellungen/google-drive/connect", async (req, reply) => {
      try {
        const s = loadDriveSettings();
        if (!s.clientId || !s.clientSecretIsSet) {
          reply.status(400);
          return {
            error: "drive-credentials-missing",
            message:
              "OAuth-Client-ID oder Secret fehlen. Bitte Felder im Verbinden-Dialog ausfüllen.",
          };
        }
        const { url } = buildAuthUrl({ protocol: req.protocol, hostname: req.hostname });
        return { authorizeUrl: url };
      } catch (e) {
        reply.status(400);
        return {
          error: "drive-connect-failed",
          message: e instanceof Error ? e.message : String(e),
        };
      }
    });

    scoped.post("/einstellungen/google-drive/disconnect", async (req) => {
      disconnect();
      resetDriveClient();
      emit("einstellung:geaendert", { key: "googleDrive", userId: req.user?.id ?? null });
      return buildResponse({ protocol: req.protocol, hostname: req.hostname });
    });

    scoped.post("/einstellungen/google-drive/test", async (_req, reply) => {
      try {
        const s = loadDriveSettings();
        if (!s.refreshTokenIsSet) {
          reply.status(400);
          return {
            erfolg: false,
            error: "drive-not-connected",
            nachricht:
              "Google Drive ist nicht verbunden. Bitte zuerst auf 'Mit Google verbinden' klicken.",
          };
        }
        const root = await ensureRootFolder();
        const out = await createTextFile({
          parentFolderId: root,
          name: `verbindungstest-${new Date().toISOString().slice(0, 10)}.txt`,
          content: "MyCleanCenter — Verbindungstest erfolgreich.",
        });
        return {
          erfolg: true,
          nachricht: "Verbindung erfolgreich getestet — Datei wurde im Root-Ordner erstellt.",
          rootOrdnerId: root,
          fileId: out.id,
          webViewLink: out.webViewLink,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setStatusError(msg);
        reply.status(500);
        return { erfolg: false, nachricht: msg };
      }
    });

    scoped.get("/drive/uploads", async (req) => {
      const q = z.object({
        status: z.enum(["pending", "running", "erfolg", "fehler", "manuell"]).optional(),
        beleg_id: z.string().optional(),
        beleg_art: z.enum(["angebot", "rechnung", "dokument"]).optional(),
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
      const s = loadDriveSettings();
      if (!s.refreshTokenIsSet) {
        reply.status(409);
        return {
          error: "drive-not-connected",
          message:
            "Google Drive ist nicht verbunden. Beleg liegt sicher lokal — bitte Drive in Einstellungen verbinden.",
        };
      }
      if (!retry(req.params.id)) { reply.status(404); return { error: "not-found" }; }
      void tickDriveQueue(1).catch(() => undefined);
      return { ok: true };
    });
  });
}
