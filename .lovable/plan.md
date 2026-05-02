## Problem

Beim Klick auf „PDF bearbeiten" (in Angebot-/Rechnungs-Detail oder im PDF-Viewer) wechselt die URL korrekt auf `/angebote/{id}/bearbeiten` bzw. `/rechnungen/{id}/bearbeiten`, aber **es erscheint nichts auf dem Bildschirm**.

## Ursache

Durch die Dateinamen
- `src/routes/angebote.$id.tsx`
- `src/routes/angebote.$id.bearbeiten.tsx`
- `src/routes/rechnungen.$id.tsx`
- `src/routes/rechnungen.$id.bearbeiten.tsx`

sind `angebote.$id` und `rechnungen.$id` für TanStack Router automatisch zu **Eltern-Routen mit Kindern** geworden (im generierten `routeTree.gen.ts` als `AngeboteIdRouteWithChildren` / `RechnungenIdRouteWithChildren` sichtbar).

TanStack-Regel:
> *„If a parent route has children, its component MUST render `<Outlet />` or the child route matches but nothing appears on screen."*

Beide Detail-Komponenten (`Page` in `angebote.$id.tsx` und `rechnungen.$id.tsx`) rendern aber **keinen `<Outlet />`** — sie rendern nur den Detail-Inhalt. Folge: Die Bearbeiten-Kindroute matcht, mountet still im Hintergrund, hat aber keinen Slot, um sichtbar zu werden. Visuell „öffnet sich" gar nichts.

Das ist ein reines Routing-Problem, kein PDF-/Mock-Backend-Problem. Der Editor selbst ist vollständig vorhanden (`PdfEditorLayout`, `LivePdfPreview`, `EditorPanel`) und braucht kein Backend — er rendert die Live-Vorschau aus den Mock-Daten.

## Fix (zwei Wege, ich nehme den saubereren)

**Weg A — Ausgewählter Fix:** Beide Detail-Routen so umbauen, dass die Detailseite *innerhalb* eines Outlet-Wrappers gerendert wird. Wenn ein Kind-Match vorliegt (`/bearbeiten`), wird **nur** das Kind (Vollbild-Editor) angezeigt, sonst die normale Detailseite. Das gibt uns:
- Die bestehende Detailseite bleibt unverändert sichtbar bei `/angebote/{id}`.
- Der Editor übernimmt bei `/angebote/{id}/bearbeiten` den vollen Bereich (er hat sowieso ein eigenes Vollbild-Layout mit eigenem Header & „Zurück"-Button).
- Keine doppelten Header/Margins, kein Verschachteln.

Konkret pro Datei:

```tsx
// src/routes/angebote.$id.tsx
import { Outlet, useMatches } from "@tanstack/react-router";

export const Route = createFileRoute("/angebote/$id")({
  component: RouteShell,
});

function RouteShell() {
  const matches = useMatches();
  const isChild = matches.some((m) => m.routeId === "/angebote/$id/bearbeiten");
  if (isChild) return <Outlet />;
  return <Page />;  // bisherige Detail-Komponente
}
```

Analog in `src/routes/rechnungen.$id.tsx` mit `"/rechnungen/$id/bearbeiten"`.

**Warum nicht einfach `return <Outlet />` als Default daneben?** Weil TanStack bei Eltern-Routen *immer* die Eltern-Komponente rendert, plus `<Outlet />` für Kinder. Wir wollen die Detailseite aber NICHT zusätzlich unter dem Editor sehen — der Editor ist vollflächig.

## Geänderte Dateien

- `src/routes/angebote.$id.tsx` — RouteShell mit Outlet-Switch ergänzen, bestehende `Page`-Komponente bleibt.
- `src/routes/rechnungen.$id.tsx` — analog.

## Was sich danach verhält

- Klick auf „PDF bearbeiten" auf Detailseite → Editor öffnet sich vollflächig mit Live-Vorschau (links) und Editor-Tabs (rechts), Header mit „Zurück", „Verwerfen", „Speichern".
- Klick auf „PDF bearbeiten" im PDF-Viewer-Dialog → Dialog schließt, Editor öffnet sich.
- „Zurück"-Button im Editor → zurück zur Detailseite.
- Bestehende Detailseiten bleiben unverändert.

## Was NICHT geändert wird

- Kein Backend, keine PDF-Generierung (du hast explizit gesagt: kommt später).
- Keine Änderung am Editor selbst, an den Panels, am Mock oder an `useBelegEditor`.
- Keine anderen Routen — `kunden.$id` z. B. hat keine Kinder und ist nicht betroffen.
