import { describe, expect, it } from "vitest";
import { isSpaPageRoute, shouldServeSpaIndex } from "../src/spa-fallback.js";

describe("SPA-Fallback für kollidierende App/API-Pfade", () => {
  it("erkennt Kunden-Detailseiten als Frontend-Routen", () => {
    expect(isSpaPageRoute("/kunden/3b288d39-2652-4556-a068-fe6045ee7f75")).toBe(true);
    expect(isSpaPageRoute("/kunden/kuerzel-frei")).toBe(false);
  });

  it("liefert index.html nur bei Browser-HTML-Requests", () => {
    expect(shouldServeSpaIndex({
      rawUrl: "/kunden/3b288d39-2652-4556-a068-fe6045ee7f75",
      method: "GET",
      accept: "text/html,application/xhtml+xml",
      hasSpaIndex: true,
    })).toBe(true);

    expect(shouldServeSpaIndex({
      rawUrl: "/kunden/3b288d39-2652-4556-a068-fe6045ee7f75",
      method: "GET",
      accept: "application/json",
      hasSpaIndex: true,
    })).toBe(false);
  });

  it("erkennt Browser-Navigation auch ohne explizites text/html", () => {
    expect(shouldServeSpaIndex({
      rawUrl: "/kunden/3b288d39-2652-4556-a068-fe6045ee7f75",
      method: "GET",
      accept: "*/*",
      headers: { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" },
      hasSpaIndex: true,
    })).toBe(true);

    expect(shouldServeSpaIndex({
      rawUrl: "/kunden/kuerzel-frei?kuerzel=BAYE",
      method: "GET",
      accept: "*/*",
      headers: { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" },
      hasSpaIndex: true,
    })).toBe(false);
  });
});