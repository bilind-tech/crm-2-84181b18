## Problem

Der frühere Build-Fehler (`ENOENT ... fonts.googleapis.com/css2?family=Inter…`) entstand, weil `src/styles.css` die Google-Fonts-URL per `@import` geladen hat — Lightning CSS (Tailwind v4 Vite-Plugin) liest `@import` aber vom Dateisystem, nicht übers Netz. Ich hatte den URL-Import bereits aus `src/styles.css` entfernt und den Font stattdessen als `<link>` im Root-Route-Head hinzugefügt.

Damit der Fehler garantiert nie wieder auftritt — auch offline auf dem Pi und bei zukünftigen Edits, die versehentlich wieder einen URL-Import einbauen — hoste ich Inter selbst über das `@fontsource-variable/inter`-npm-Paket. Dann existiert die Font-Datei als lokales Modul, und Google Fonts ist überhaupt keine Abhängigkeit mehr.

## Änderungen

1. **Paket installieren**
   - `bun add @fontsource-variable/inter`

2. **`src/styles.css`** — statt URL-Import den lokalen Import ganz oben (vor allen anderen Regeln, wie Lightning CSS verlangt):
   ```css
   @import "@fontsource-variable/inter";
   @import "tailwindcss" source(none);
   @source "../src";
   @import "tw-animate-css";
   ```
   Die `@theme`- und `font-family`-Zeilen für „Inter" bleiben unverändert — der Font-Name ist derselbe.

3. **`src/routes/__root.tsx`** — die drei zuvor eingefügten `<link>`-Tags (preconnect × 2 + Google-Fonts-Stylesheet) wieder entfernen, weil sie mit dem selbstgehosteten Font überflüssig sind und sonst zwei Font-Quellen parallel geladen würden. Favicons/übrige Links bleiben.

## Warum das den Fehler dauerhaft eliminiert

- Kein Netzwerk-Import in CSS → Lightning CSS kann nicht mehr auf `fonts.googleapis.com` stolpern.
- Kein CDN-`<link>` mehr → funktioniert auch im LAN-Only-Betrieb auf dem Pi.
- Falls jemand später wieder `@import "https://…"` in eine CSS-Datei schreibt, brechen wir das nur an dieser einen Stelle erneut — die produktive Lösung bleibt hier dokumentiert.

## Verifikation

- Dev-Server-Log nach Neustart (`sqlite3 /tmp/sandbox-state.db "SELECT content FROM daemon_logs WHERE daemon_name='vite' AND content LIKE '%styles.css%' ORDER BY id DESC LIMIT 20;"`) darf keinen ENOENT / Lightning-CSS-Fehler zeigen.
- Preview öffnen, Schriftbild prüfen (Inter muss weiterhin geladen sein).

## Nicht Teil dieser Änderung

- Die PDF-/Objekt-Änderungen aus dem vorherigen Plan bleiben unangetastet.
- Der im Log sichtbare `DOMMatrix is not defined` (SSR-Aufruf von pdf.js) ist ein anderes Thema und nicht Ursache des vom User zitierten Build-Fehlers.
