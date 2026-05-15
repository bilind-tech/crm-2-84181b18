# Plan: „Bad Gateway" beim E-Mail-Versand sichtbar machen & beheben

## Was ist „Bad Gateway"?

Das ist **nicht** ein Lovable/Cloud-Fehler — es ist die HTTP-Statusnachricht **502** vom Pi-Backend. Der Backend-Code (`backend/src/routes/email.ts`, Zeile 223) macht das absichtlich:

```
reply.status(result.ok ? 201 : 502);
return { ...row, sendOk:false, sendError, sendErrorCode };
```

→ Wenn `sendNow()` aus `backend/src/email/worker.ts` fehlschlägt (SMTP-Fehler, PDF-Render-Fehler, Timeout …), antwortet das Backend mit **502 + Body**, der den **echten Grund** in `sendError` / `sendErrorCode` enthält.

## Warum siehst du nur „Bad Gateway"?

`src/lib/api/piClient.ts` (Zeile 93-98) sucht im Fehler-Body nur nach `error` oder `message` — nicht nach `sendError`. Beides ist im Body nicht vorhanden, also fällt der Client auf `res.statusText` zurück → das ist genau der String **„Bad Gateway"**. Der echte Fehler (z. B. „SMTP-Server nicht erreichbar", „EAUTH", „PDF konnte nicht erstellt werden") liegt im Body, wird aber verworfen.

## Mögliche echte Ursachen (Reihenfolge nach Wahrscheinlichkeit)

1. **SMTP-Fehler** (Strato): falsches Passwort (`EAUTH`), Host/Port falsch (`ECONNECTION`/`ETIMEDOUT`), TLS-Problem (`ESOCKET`), DNS (`EDNS`), Empfänger abgelehnt (`EENVELOPE`).
2. **PDF-Render-Fehler**: `renderAngebotPdf` / `renderRechnungPdf` wirft → `errorCode: "PDF_RENDER_FAILED"`. Das wäre dann derselbe Render-Fehler wie zuletzt, nur backend-seitig.
3. **Anhang zu groß** (>15 MB) → `ATTACHMENT_TOO_LARGE`.
4. **Timeout** (30 s) — Strato hängt.
5. **SMTP gar nicht konfiguriert** → eigentlich 412/400, aber gemeldet wenn Settings inkonsistent.

## Fix-Plan in zwei Schritten

### Schritt 1 — Sofort: Echten Fehler sichtbar machen (1 Datei)

`src/lib/api/piClient.ts` so erweitern, dass für die `/email/versand`-Route der `sendError` aus dem Body bevorzugt wird:

```text
msg = data.sendError ?? data.error ?? data.message ?? res.statusText;
```

Zusätzlich `errorCode` (oder `sendErrorCode`) im `PiApiError.body` lassen, damit der `EmailVersandDialog` ihn anzeigen kann. Toast wird dann z. B.:
- „Versand fehlgeschlagen: Anmeldung am SMTP-Server fehlgeschlagen — Benutzername oder Passwort falsch."
- „Versand fehlgeschlagen: PDF konnte nicht erstellt werden: …"

Optional: kleine Diagnose-Box im `EmailVersandDialog`, die `sendErrorCode` (z. B. `EAUTH`, `PDF_RENDER_FAILED`) plus Kurzbeschreibung anzeigt — analog zur PDF-Diagnose-Box.

**Keine Backend-Änderungen.** Detail-Seiten und Listen werden nicht angefasst → kein Risiko, dass die Seite wieder kaputt geht wie davor.

### Schritt 2 — Nach deinem Output: Echte Ursache fixen

Sobald du mir den jetzt sichtbaren Fehlertext + Code schickst, weiß ich genau, wo:
- `EAUTH` / `ECONNECTION` … → `Einstellungen → E-Mail-Server` (SMTP-Konfig auf dem Pi).
- `PDF_RENDER_FAILED` → `backend/src/pdf/belegPdf.server.ts` bzw. `backend/src/pdf/render.ts`.
- `ATTACHMENT_TOO_LARGE` → PDF-Optimierung in `backend/src/pdf/`.
- `Timeout (smtp.sendMail, 30000ms)` → SMTP-Timeout/Strato-Limits.
- Anderes → gezielt nach Code-Ort suchen.

## Geplante Datei-Änderungen (nur Schritt 1)

- `src/lib/api/piClient.ts` — `request()`-Funktion: `sendError` und `sendErrorCode` mit in die Fehlermeldung aufnehmen.
- (Optional) `src/components/email/EmailVersandDialog.tsx` — kleine Diagnose-Zeile, die `errorCode` aus `body` rendert, falls vorhanden.

## Was NICHT angefasst wird

- Keine Routen, kein `routeTree.gen.ts`, keine Detail-Seiten, kein PDF-Viewer, keine Backend-Routes. Damit ist ausgeschlossen, dass die Rechnungs-/Angebots-Detailseite wieder bricht.

## Nächster Schritt

Plan freigeben → ich setze Schritt 1 um. Du klickst dann nochmal auf „E-Mail senden", schickst mir den jetzt klaren Fehlertext + Code, und ich weiß sofort, wo Schritt 2 hin muss.
