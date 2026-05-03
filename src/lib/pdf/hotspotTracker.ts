// Hotspot-Tracker für pdfmake.
// Sammelt während des Layouts via `pageBreakBefore` die echten Positionen aller
// Nodes mit `id`. Daraus werden Box-Hotspots in PDF-Punkten (1pt = 1/72 in)
// abgeleitet, die die LivePdfPreview pro Seite einblendet.
//
// Heuristik für Höhe: weil pdfmake die Endposition nicht direkt liefert,
// nehmen wir den vertikalen Abstand zum nächsten getrackten Node auf derselben
// Seite. Wenn es keinen gibt, fallen wir auf den unteren Seitenrand (mit
// kleinem Sicherheitsabstand) oder eine Mindesthöhe zurück.

export interface RuntimeHotspot {
  /** stabile Feld-ID, z.B. "titel", "kunde", "pos:abc123" */
  id: string;
  page: number;
  /** Position & Größe in PDF-Punkten. Top ist 0 oben. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageGeometry {
  /** Seitenbreite in pt (A4 portrait: 595.28) */
  width: number;
  /** Seitenhöhe in pt (A4 portrait: 841.89) */
  height: number;
  /** Inhalts-Margins [links, oben, rechts, unten] */
  margins: [number, number, number, number];
}

interface RawHit {
  id: string;
  pageNumber: number;
  left: number;
  top: number;
  /** Falls direkt vom Node bekannt (selten) */
  width?: number;
}

/** Erzeugt einen Tracker, der als pdfmake `pageBreakBefore`-Callback dient. */
export function createHotspotTracker(geom: PageGeometry) {
  const hits: RawHit[] = [];
  const seen = new Set<string>();

  // pdfmake-Signatur: (currentNode, followingNodesOnPage, nodesOnNextPage, previousNodesOnPage)
  // Wir sammeln nur und geben immer `false` zurück — keine Layout-Beeinflussung.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageBreakBefore = (currentNode: any): boolean => {
    try {
      const id: string | undefined = currentNode?.id;
      if (!id || seen.has(id)) return false;
      const sp = currentNode?.startPosition;
      if (!sp || typeof sp.pageNumber !== "number") return false;
      seen.add(id);
      hits.push({
        id,
        pageNumber: sp.pageNumber,
        left: typeof sp.left === "number" ? sp.left : geom.margins[0],
        top: typeof sp.top === "number" ? sp.top : geom.margins[1],
      });
    } catch {
      /* ignore */
    }
    return false;
  };

  const build = (): RuntimeHotspot[] => {
    // Sortiere pro Seite nach top, um Höhen aus dem Abstand zum nächsten Hit zu
    // berechnen. So vermeiden wir riesige überlappende Boxen.
    const byPage = new Map<number, RawHit[]>();
    for (const h of hits) {
      const arr = byPage.get(h.pageNumber) ?? [];
      arr.push(h);
      byPage.set(h.pageNumber, arr);
    }
    const out: RuntimeHotspot[] = [];
    const contentRight = geom.width - geom.margins[2];
    const contentBottom = geom.height - geom.margins[3];
    for (const arr of byPage.values()) {
      arr.sort((a, b) => a.top - b.top);
      for (let i = 0; i < arr.length; i++) {
        const cur = arr[i];
        const next = arr[i + 1];
        const bottomBound = next ? next.top - 2 : contentBottom;
        const x = Math.max(geom.margins[0] - 4, cur.left - 4);
        const y = Math.max(geom.margins[1] - 4, cur.top - 4);
        const w = Math.max(40, contentRight - x + 4);
        const rawH = bottomBound - cur.top;
        const h = Math.max(14, Math.min(rawH + 6, contentBottom - cur.top + 6));
        out.push({ id: cur.id, page: cur.pageNumber, x, y, w, h });
      }
    }
    return out;
  };

  return { pageBreakBefore, build };
}

/** A4 in pt (Standard pdfmake). */
export const A4: PageGeometry = {
  width: 595.28,
  height: 841.89,
  margins: [40, 90, 40, 110],
};
