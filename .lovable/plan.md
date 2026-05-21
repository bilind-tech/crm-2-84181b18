## Änderungen in `src/lib/pdf/werkzeugePdf.ts`

Diese Datei rendert sowohl das **Übergabe-/Abnahmeprotokoll** als auch die **Schlüsselübergabe**. Beide nutzen dieselben Helpers `header()` und `footer()` – ein Fix wirkt auf beide PDF-Typen.

### 1. Footer: rechte Spalte rechtsbündig (analog Belege)
In `footer()` (Zeile 114–147) den `cell()`-Helper erweitern, damit eine `alignment`-Option durchgereicht werden kann. Anwendung:
- Spalte 1 (Firmenname / GF / Adresse): links (Default)
- Spalte 2 (Bank / IBAN): links (Default)
- Spalte 3 (Telefon / E-Mail): mittig (`alignment: "center"`)
- Spalte 4 (Handelsregister / USt-ID / Webseite): rechtsbündig (`alignment: "right"`)

Damit ist das Footer-Layout 1:1 identisch zu Angebot/Rechnung.

### 2. Logo zuverlässig anzeigen
Aktuell sieht der Header-Aufruf so aus:
```ts
const logo = await logoDataUrl(data.firma?.logoUrl);
```
Wenn `firma.logoUrl` einen leeren String enthält (statt `undefined`), liefert `logoDataUrl` zwar den Fallback aus `@/assets/logo.png` – aber nur, wenn der Trim greift. Ich prüfe den Pfad nochmal und ergänze:
- In `logoDataUrl()` (Zeile 39–53) den Check auf `src?.trim()` strikter ziehen, sodass auch `" "` oder `null` zuverlässig auf das Fallback fallen.
- Sicherstellen, dass `header()` das Logo wirklich rendert wenn `opt.logoSichtbar !== false` (aktuell korrekt, nur Defensiv-Check).
- Falls der Fetch des Asset-Imports im Worker/SSR-Kontext fehlschlägt, ein zweites Try mit direktem `new URL("@/assets/logo.png", import.meta.url).href`-Pattern als zusätzlicher Fallback.

### 3. (nicht betroffen, bleibt wie ist)
- Inhalt der Protokolle, Meta-Boxen, Tabellen, Unterschriften.
- Header-Logik (Absenderzeile links, Logo rechts).
- `useProtokollPdf` / Detailseiten / PDF-Editor – nur die PDF-Engine selbst wird angefasst.

### Verifikation
Nach dem Patch in der Vorschau ein Übergabeprotokoll und eine Schlüsselübergabe öffnen und prüfen:
1. Logo rechts oben sichtbar.
2. Footer: linke 2 Spalten links, Telefon-Spalte mittig, rechte Spalte (HR / USt-ID / Webseite) rechtsbündig.
