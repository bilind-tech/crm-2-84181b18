**Problem**
Im PDF-Header (Angebot / Rechnung / Protokolle) rendert die Code-Stelle bei fehlendem Logo einen großen fetten Firmennamen in Großbuchstaben (`"MY CLEAN CENTER"` bzw. `firma.firmenname.toUpperCase()` in 20pt, bold, rechts oben). Das ist hässlich und gewollt entfernt. Außerdem soll die Logo-Anzeige direkt funktionieren, sobald in Einstellungen → Firmendaten → Logo etwas hochgeladen wurde.

**Recherche-Ergebnis**

1. Backend-PDF (Angebot/Rechnung) – `backend/src/pdf/layout.ts:83-86`: Fallback = `f.firmenname.toUpperCase()` bold 20pt.
2. Frontend-PDF (Angebot/Rechnung – Fallback-Renderer) – `src/lib/pdf/belegPdf.ts:208-217`: gleicher Großbuchstaben-Fallback (greift, wenn weder Settings-Logo noch Asset-Logo geladen werden konnten).
3. Protokolle – `src/lib/pdf/werkzeugePdf.ts:107-116`: identischer Fallback `"MY CLEAN CENTER"` bold 20pt.
4. Logo aus Einstellungen wird korrekt durchgereicht:
   - Settings speichern `firma.logoUrl` als data-URL (`src/routes/einstellungen.tsx:326`).
   - Backend liest sie in `loadLogoDataUrl()` (`backend/src/pdf/firma.ts:55-58`) und übergibt sie an Header und Cache-Fingerprint.
   - Es gibt also keinen Bug im Lade-Pfad – die User-Beobachtung „Logo wird nicht angezeigt" stammt nur daher, dass aktuell kein Logo gesetzt ist UND der Fallback eben den fetten Namen zeigt.

**Änderungen (3 Dateien, nur Frontend/Backend-PDF-Layout)**

1. `backend/src/pdf/layout.ts` – `header()`:
   - Bei `!logoDataUrl`: statt fetter Namens-Spalte ein leerer Platzhalter (`{ width: 270, text: "" }`), damit Layout/Spaltenbreite stabil bleibt.

2. `src/lib/pdf/belegPdf.ts` – `header()`: gleicher leerer Platzhalter bei `!logo`.

3. `src/lib/pdf/werkzeugePdf.ts` – Protokoll-Header (Zeile ~107): gleicher leerer Platzhalter bei `!(logo && logoSichtbar)`.

Footer bleibt unangetastet – Firmenname/Adresse stehen weiterhin im Fuß. Wenn ein Logo gesetzt ist (heute schon funktionsfähig), wird es weiterhin oben rechts mit `fit: [270, 120]` gerendert.

**Nicht angefasst**
- Backend-Routen, Cache-Hash (Logo-Fingerprint), Settings-UI, Upload-Pfad.
- Drive-Sync, Druckfluss, übrige PDF-Inhalte.

**Akzeptanz**
- Ohne hochgeladenes Logo: Kopfzeile rechts oben ist leer (kein „MYCLEANCENTER" mehr) – Angebot, Rechnung, Protokolle.
- Nach Logo-Upload in Einstellungen: Logo erscheint rechts oben in allen drei PDF-Typen (Cache wird durch geänderten `logoFingerprint` automatisch invalidiert).