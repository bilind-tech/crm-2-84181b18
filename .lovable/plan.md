## Was du siehst

Frontend zeigt nur `Versand fehlgeschlagen: internal server error`, weil das Backend bei diesem Fall mit HTTP 500 + generischer Fastify-Fehlerantwort antwortet. Die echte Ursache (vermutlich ein Fehler beim Erstellen der Rechnungs-PDF, die als Anhang an die Mail gehängt wird) wird **vor** der Antwort verschluckt — sowohl SMTP-Verbindungsprüfung als auch Test-Mail funktionieren, weil dort **kein PDF-Anhang** gerendert wird. Sobald eine Mail mit Beleg-PDF rausgeht, läuft der Pfad `sendNow → renderRechnungPdf → pdfmake → ...` — und wenn dort etwas wirft (z. B. bei einer Rechnung mit ungewöhnlichen Daten, fehlendem Feld, kaputtem Logo o. ä.), bubble der Fehler unvermittelt in den globalen `setErrorHandler` und wird zu „Internal Server Error".

Konkret:

1. `backend/src/email/worker.ts → sendNow` ruft `renderRechnungPdf(row.belegId)` **außerhalb** des `try/catch`. Wirft das Rendern, geht der Fehler raus aus der Route.
2. `backend/src/server.ts:202-209` `setErrorHandler` ersetzt jeden 5xx-Fehler mit `{ error: "Internal Server Error" }`. Frontend zeigt diese generische Message an. Echter Stack landet nur in `journalctl -u mycleancenter`.
3. Die Route `POST /email/versand` (`backend/src/routes/email.ts:127`) hat keinen umfassenden `try/catch` um `sendNow` und auch nicht um die SMTP-Settings/Enqueue-Schritte.

## Ziel

- Versand mit Beleg-PDF funktioniert.
- Falls doch etwas knallt: Frontend zeigt **die echte Ursache** auf Deutsch an (z. B. „PDF konnte nicht erstellt werden — Logo ungültig"), nicht „internal server error".
- Pi-Logs zeigen weiter den vollen Stack zum Nachschauen.

## Lösung — Schritt für Schritt

### 1) PDF-Render-Fehler sauber abfangen (`backend/src/email/worker.ts`)

`sendNow`: PDF-Erzeugung in eigenes `try/catch` packen. Bei Fehler → `markFehler(row.id, msg)` + `return { ok: false, error: "PDF konnte nicht erstellt werden: …", errorCode: "PDF_RENDER_FAILED" }`. Damit liefert der Route-Handler bereits jetzt 502 + strukturierte Message zurück (siehe Zeile 222 in `routes/email.ts`), das Frontend zeigt sie via `err.body.message` an.

```ts
let pdf: RenderResult | null = null;
if (row.belegArt && row.belegId) {
  try {
    pdf = row.belegArt === "angebot"
      ? await renderAngebotPdf(row.belegId)
      : await renderRechnungPdf(row.belegId);
  } catch (e) {
    const msg = `PDF konnte nicht erstellt werden: ${(e as Error).message ?? "Unbekannter Fehler"}`;
    markFehler(row.id, msg);
    return { ok: false, error: msg, errorCode: "PDF_RENDER_FAILED" };
  }
  if (pdf) { /* size check + push to attachments wie heute */ }
}
```

### 2) Route `POST /email/versand` mit Schutzschicht versehen (`backend/src/routes/email.ts`)

Den gesamten Inhalt der Route in einen äußeren `try/catch` packen. Im `catch`:

```ts
req.log.error({ err }, "Versand-Route Fehler");
audit({ userId: req.user?.id, ip: req.ip, action: "email.send.fehler", detail: { error: (err as Error).message } });
reply.status(500);
return {
  error: "versand-fehler",
  message: (err as Error).message ?? "Unbekannter Fehler beim Versand",
};
```

So überschreibt die Route die generische Fastify-500-Antwort und liefert die echte Message — auch wenn der Fehler nicht aus `sendNow` selbst kommt (z. B. aus `loadSmtpRuntime`).

### 3) Globaler `setErrorHandler` (`backend/src/server.ts`) — kleines Refinement

Nicht-5xx weiter wie heute durchreichen. Bei 5xx zusätzlich die Original-Message **nur in den Pi-Logs** ausgeben (machen wir bereits via `req.log.error`), aber dem Client weiterhin die generische Antwort geben — das ist sicher. Diese Datei muss nicht geändert werden, solange die Route (Schritt 2) den 500-Fall vorher abfängt. Wir lassen sie unverändert.

### 4) Defensive Verbesserungen im Renderer (`backend/src/pdf/belegPdf.server.ts`, `backend/src/pdf/render.ts`)

- `renderPdf`: Fehler aus `printer.createPdfKitDocument(docDef)` (synchroner Wurf) und aus dem Stream sauber als `Error` mit aussagekräftiger Message weiterreichen — ggf. `err.message` mit „pdfmake: " präfixen. Verhindert „undefined"-Stack im Frontend.
- `renderRechnungPdf` / `renderAngebotPdf`: wenn `getRechnung` / `getKunde` `null` liefert, statt stillem `return null` einen sprechenden `Error` werfen (z. B. „Rechnung nicht mehr vorhanden"), den Schritt 1 sauber als `PDF_RENDER_FAILED` ausgibt. Sonst würde `sendNow` einfach ohne Anhang weiterlaufen (heutiges Verhalten ist `attachments` bleibt leer).

### 5) Verifikation

- Echte Mail aus einer Rechnungsdetailseite → Senden. Erwartung: entweder erfolgreich (wenn Render jetzt durchläuft) oder strukturierter Fehler-Toast wie „PDF konnte nicht erstellt werden: <konkreter Grund>".
- `sudo journalctl -u mycleancenter -n 50 --no-pager` zeigt den vollen Stack — damit lässt sich die Wurzelursache direkt benennen, sobald wir einen echten Render-Fehler sehen. Sollte der Render-Fehler ein triviales Datenproblem sein (fehlendes Feld auf der Rechnung, kaputtes Logo etc.), patchen wir das in einem Folgeschritt direkt.
- SMTP-Test-Mail (ohne Anhang) muss weiter funktionieren — am Code dieses Pfads ändern wir nichts.

## Was *nicht* angefasst wird

- Manual-Only-Garantie (`enqueueVersand` weiterhin nur `quelle: "manuell"`).
- SMTP-Transport / Strato-Konfiguration.
- Daten in `/var/lib/mycleancenter`.
- Frontend `EmailVersandDialog` — Toast-Logik liest `err.body.message` bereits korrekt aus.

## Dateien, die geändert werden

- `backend/src/email/worker.ts` — PDF-Render in eigenes try/catch (`PDF_RENDER_FAILED`).
- `backend/src/routes/email.ts` — äußerer try/catch um die Versand-Route, strukturierte 500-Antwort.
- `backend/src/pdf/belegPdf.server.ts` — sprechende Errors statt stiller Null-Returns.
- `backend/src/pdf/render.ts` — pdfmake-Fehler mit Präfix versehen.
