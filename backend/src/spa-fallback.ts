import type { FastifyInstance } from "fastify";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function normalizedPath(rawUrl: string): string {
  const pathname = rawUrl.split(/[?#]/, 1)[0] || "/";
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function acceptsHtml(acceptHeader: string | string[] | undefined): boolean {
  const accept = Array.isArray(acceptHeader) ? acceptHeader.join(",") : (acceptHeader ?? "");
  return accept.toLowerCase().includes("text/html");
}

function isDocumentNavigation(headers: Record<string, unknown>): boolean {
  const mode = String(headers["sec-fetch-mode"] ?? "").toLowerCase();
  const dest = String(headers["sec-fetch-dest"] ?? "").toLowerCase();
  return mode === "navigate" || dest === "document";
}

export function isSpaPageRoute(rawUrl: string): boolean {
  const p = normalizedPath(rawUrl);
  if (["/kunden", "/angebote", "/rechnungen", "/objekte", "/protokolle", "/dokumente"].includes(p)) {
    return true;
  }
  if (["/kunden/neu", "/angebote/neu", "/rechnungen/neu", "/objekte/neu"].includes(p)) {
    return true;
  }
  if (/^\/kunden\/(?!kuerzel-frei$)[^/]+$/.test(p)) return true;
  if (/^\/angebote\/[^/]+$/.test(p) || /^\/angebote\/[^/]+\/bearbeiten$/.test(p)) return true;
  if (/^\/rechnungen\/[^/]+$/.test(p) || /^\/rechnungen\/[^/]+\/bearbeiten$/.test(p)) return true;
  if (/^\/objekte\/[^/]+$/.test(p)) return true;
  if (/^\/protokolle\/[^/]+$/.test(p) || /^\/protokolle\/[^/]+\/bearbeiten$/.test(p)) return true;
  return false;
}

export function shouldServeSpaIndex(args: {
  rawUrl: string;
  method: string;
  accept?: string | string[];
  headers?: Record<string, unknown>;
  hasSpaIndex: boolean;
}): boolean {
  if (!args.hasSpaIndex) return false;
  if (args.method !== "GET" && args.method !== "HEAD") return false;
  if (!acceptsHtml(args.accept) && !isDocumentNavigation(args.headers ?? {})) return false;
  return isSpaPageRoute(args.rawUrl);
}

export function registerSpaPageFallback(
  app: FastifyInstance,
  frontendDir: string,
): { spaIndex: string; hasSpaIndex: boolean } {
  const spaIndex = path.resolve(frontendDir, "index.html");
  const hasSpaIndex = existsSync(spaIndex);

  app.addHook("onRequest", async (req, reply) => {
    if (!shouldServeSpaIndex({
      rawUrl: req.raw.url ?? "/",
      method: req.method,
      accept: req.headers.accept,
      headers: req.headers,
      hasSpaIndex,
    })) {
      return;
    }
    reply.type("text/html; charset=utf-8");
    if (req.method === "HEAD") return reply.send();
    return reply.send(readFileSync(spaIndex));
  });

  return { spaIndex, hasSpaIndex };
}