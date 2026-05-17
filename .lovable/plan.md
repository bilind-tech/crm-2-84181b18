# Plan: Restarbeiten Kunden-Löschen, Logo-UI & Stundenzettel-Proxy

Drei abgegrenzte Bausteine, die alle Backend- und Frontend-Endstücke aus dem letzten Lauf abschließen.

## 1. KundeLoeschenDialog: echtes „Endgültig löschen"

**Problem:** Backend kann bereits `?force=1` (cascading delete), aber `KundeLoeschenDialog.tsx` ruft `del.mutate(kunde.id)` ohne `force` — deshalb bleibt der Kunde nach Soft-Delete als inaktiv hängen.

- Dialog auf neue Signatur umstellen: `del.mutate({ id: kunde.id, force: true })`.
- Stufe 2 zusätzlich um eine sichtbare Checkbox **„Inkl. aller Rechnungen, Angebote, Zahlungen und Dokumente endgültig löschen"** ergänzen (default an, wenn `hatDaten`). Wenn Nutzer abwählt, wird `force=false` gesendet (Soft-Archiv).
- Button-Text dynamisch: „Endgültig löschen" vs. „Archivieren".
- Fehler-Toast: zeigt Server-Message (z. B. 409) klartext.

**Datei:** `src/components/forms/KundeLoeschenDialog.tsx`

## 2. Kunden-Logo Frontend

Backend liefert bereits `GET/POST/DELETE /kunden/:id/logo`, `hasLogo` und `logoUpdatedAt` im Kunde-Objekt. Frontend baut darauf auf.

### 2.1 Typ & API-Helpers
- `Kunde` in `src/lib/api/types.ts` erweitern: `hasLogo?: boolean; logoUpdatedAt?: string`.
- `src/hooks/useApi.ts`: neue Hooks
  - `useKundeLogoUrl(kundeId, logoUpdatedAt)` → liefert authentifizierte Blob-URL (Cache-Bust über `logoUpdatedAt`).
  - `useUploadKundeLogo()` → multipart POST.
  - `useDeleteKundeLogo()` → DELETE; invalidiert `kunden`-Queries.

### 2.2 Wiederverwendbare Komponente
- Neu: `src/components/kunden/KundeLogo.tsx`
  - Props: `kunde, size: "sm"|"md"|"lg"|"xl", className?`
  - Wenn `hasLogo`: zeigt Bild via Blob-URL.
  - Fallback: Initialen-Avatar in `bg-muted` (Firmenkürzel oder erste 2 Buchstaben).
- Neu: `src/components/kunden/KundeLogoUploadDialog.tsx`
  - Drag-and-drop + File-Input, Vorschau, MIME-/Größen-Check vor Upload (≤2 MB, PNG/JPG/WebP/SVG).
  - Buttons „Hochladen", „Entfernen" (nur wenn vorhanden), „Schließen".

### 2.3 Einbindung
- **Kundenliste** `src/routes/kunden.tsx`: kleines `KundeLogo size="sm"` links neben Name in jeder Zeile / Karte.
- **Kunden-Detailseite** `src/routes/kunden.$id.tsx`: großes `KundeLogo size="xl"` im Header, daneben „Logo ändern"-Button → öffnet Upload-Dialog.
- **PDF (Rechnung/Angebot)**: in `src/lib/pdf/belegPdf.ts` Logo-Quelle erweitern — wenn Kunde `hasLogo`, lade Blob als Data-URL und reiche es als sekundäres Logo („Kunden-Logo") an den PDF-Renderer. Position: rechts oben unter dem Firmen-Logo, max. 30 mm breit. Wenn `logoOverride` (Per-Beleg) gesetzt ist, hat das weiterhin Vorrang. Renderer-Anpassung minimal in `belegPdf.ts`/Layout, kein neuer PDF-Server-Code nötig (Daten gehen über bestehenden Payload).

## 3. Stundenzettel Reverse-Proxy

**Problem:** Iframe lädt LAN-Adresse nicht aus der Cloud-Preview und HTTP-in-HTTPS wird vom Browser blockiert. Lösung: Backend (Pi) proxied die externe App, Frontend lädt sie über `/extern/stundenzettel/*` derselben Origin.

### 3.1 Backend
- Neu: `backend/src/routes/extern.ts`
  - Registriert unter Auth-geschütztem Scope: `ALL /extern/stundenzettel/*`.
  - Liest `externeUrl` aus Settings-Store (Cache + Invalidate bei PATCH).
  - Forward via `undici`/`fetch`: Methode, Path-Splat, Query, Body, Header (außer `host`, `cookie` durchreichen optional). Antwort streamt zurück; entfernt `X-Frame-Options` und `Content-Security-Policy` headers, damit Einbettung im iframe funktioniert.
  - Wenn `externeUrl` leer → 503 mit JSON `{error:"not-configured"}`.
- Registrieren in `backend/src/server.ts`.

### 3.2 Frontend
- `src/lib/stundenzettel/config.ts`: zusätzliche Ableitung `useStundenzettelEmbedUrl()` → wenn `externeUrl` gesetzt, gibt sie `'/extern/stundenzettel/'` (relativ zur Backend-Origin via `backendUrl`) zurück; sonst leer.
- `src/routes/stundenzettel.tsx`:
  - Iframe-`src` benutzt Embed-URL statt direkter `externeUrl`.
  - Die Hindernis-Analyse (`lan-aus-cloud`, `mixed-content`) entfällt für den Embed-Pfad — Proxy löst beides. Hinweisbox nur noch, wenn Backend 503 zurückgibt (eigener Empty-State „Stundenzettel-Backend nicht erreichbar / nicht konfiguriert").
  - „In neuem Tab" weiterhin mit Original-`externeUrl`.

## Out of scope

- Keine Anpassung der Lifecycle-Status für Belege (separates Thema).
- Kein automatischer E-Mail-Versand (verboten laut Core-Memory).
- Kein Drive-Sync für Kunden-Logos.

## Technical notes

- `useApi.ts` Blob-Fetch via `api.getBlob` (existiert bereits für PDF). Falls nicht, ad-hoc mit `fetch` + Auth-Header aus `client.ts`.
- Proxy-Route nutzt Fastify-Raw-Stream: `reply.raw` für Streaming. Headers-Whitelist Response: alles außer `content-encoding` (gzip wird vom Upstream-Server schon gesetzt) — sicherer: re-deflate vermeiden, Encoding 1:1 durchleiten. `x-frame-options` und `content-security-policy` entfernen.
- Tests: kein Pflichtmuss, aber `backend/test/` ein kleiner Smoke-Test für `/extern/stundenzettel` (503 wenn unkonfiguriert) wäre nice-to-have.

## Dateien (Übersicht)

Backend:
- `backend/src/routes/extern.ts` (neu)
- `backend/src/server.ts` (Route registrieren)

Frontend:
- `src/lib/api/types.ts`
- `src/hooks/useApi.ts`
- `src/components/forms/KundeLoeschenDialog.tsx`
- `src/components/kunden/KundeLogo.tsx` (neu)
- `src/components/kunden/KundeLogoUploadDialog.tsx` (neu)
- `src/routes/kunden.tsx`
- `src/routes/kunden.$id.tsx`
- `src/lib/pdf/belegPdf.ts`
- `src/lib/stundenzettel/config.ts`
- `src/routes/stundenzettel.tsx`
