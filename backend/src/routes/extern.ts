// Reverse-Proxy für externe LAN-Apps, die im CRM-Frontend als iframe
// eingebettet werden. Aktuell nur Stundenzettel.
//
// Warum Proxy:
//   - Browser blockiert HTTP-Iframes in HTTPS-Seiten (Mixed Content).
//   - LAN-Adressen sind aus der Cloud-Preview nicht erreichbar.
//   - Viele Apps setzen X-Frame-Options: DENY → Einbettung scheitert.
// Indem das Backend (Pi) die Antwort durchreicht und Frame-Header strippt,
// läuft die Einbettung über dieselbe Origin wie das CRM.

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireAuth } from "../auth/middleware.js";
import { getSetting } from "../settings/store.js";
import { StundenzettelSchema } from "../settings/schemas.js";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

function getStundenzettelBase(): string {
  const raw = getSetting("stundenzettel") ?? {};
  const parsed = StundenzettelSchema.parse(raw);
  return parsed.externeUrl.trim().replace(/\/$/, "");
}

async function proxyTo(
  base: string,
  pathSuffix: string,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const url = new URL(`${base}${pathSuffix || "/"}`);
  const incomingUrl = new URL(req.url, "http://x");
  for (const [k, v] of incomingUrl.searchParams) url.searchParams.append(k, v);

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!v) continue;
    const lk = k.toLowerCase();
    if (HOP_BY_HOP.has(lk)) continue;
    if (lk === "cookie") continue; // niemals CRM-Cookies nach extern
    headers[k] = Array.isArray(v) ? v.join(", ") : String(v);
  }

  const method = req.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  // @ts-expect-error duplex required by undici fetch when streaming bodies
  const init: RequestInit & { duplex?: string } = {
    method,
    headers,
    redirect: "manual",
  };
  if (hasBody) {
    init.body = req.raw as unknown as BodyInit;
    init.duplex = "half";
  }

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), init);
  } catch (err) {
    req.log.warn({ err, url: url.toString() }, "extern proxy upstream error");
    reply.status(502).send({ error: "upstream-unreachable" });
    return;
  }

  reply.status(upstream.status);
  upstream.headers.forEach((value, key) => {
    const lk = key.toLowerCase();
    if (HOP_BY_HOP.has(lk)) return;
    if (lk === "x-frame-options") return;
    if (lk === "content-security-policy") return;
    if (lk === "content-security-policy-report-only") return;
    reply.header(key, value);
  });

  if (!upstream.body) {
    reply.send();
    return;
  }
  const buf = Buffer.from(await upstream.arrayBuffer());
  reply.send(buf);
}

export async function externRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);

    const handler = async (req: FastifyRequest, reply: FastifyReply) => {
      const base = getStundenzettelBase();
      if (!base) {
        reply.status(503);
        return { error: "not-configured" };
      }
      const params = req.params as { "*"?: string };
      const suffix = params["*"] ? `/${params["*"]}` : "/";
      await proxyTo(base, suffix, req, reply);
    };

    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const) {
      scoped.route({ method, url: "/extern/stundenzettel", handler });
      scoped.route({ method, url: "/extern/stundenzettel/*", handler });
    }
  });
}