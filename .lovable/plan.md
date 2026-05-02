# Steuer-Seite: Polish + manuelle Bezahlt-Erfassung

## 1. Sparschwein-Karte aufräumen

- **Sparschwein-Icon raus** — komplett, kein Ersatz-Icon. Nur Text + Zahlen.
- **Überschrift neutral**: „Was du zurücklegen solltest" → **„Empfohlene Rücklage"**
- **Untertext neutral**: „Damit das Finanzamt jederzeit bedient werden kann." → **„Reicht aus, um alle aktuell offenen Steuerforderungen zu decken."**
- Aufschlüsselungs-Zeilen mit „exakt"/„Schätzung"-Badges bleiben unverändert.

## 2. Rhythmus aus Überschrift entfernen

- „Umsatzsteuer · monatliche Voranmeldungen" → schlicht **„Umsatzsteuer"**
- Rhythmus bleibt nur noch in den Einstellungen sichtbar.

## 3. Manuelle Bezahlt-Erfassung mit Eingabe

Neuer dezenter Button **„Zahlung erfassen"** rechts oben im Header (statt des entfernten „Termin anlegen"). Klick öffnet einen Dialog im Stil des `ZahlungErfassenDialog` für Rechnungen.

### Dialog „Steuerzahlung erfassen"

Schritte (kompakt, alles in einem Dialog ohne mehrstufige Frage):

**Eingabefelder:**

1. **Welche Steuer?** — Dropdown: Umsatzsteuer · Körperschaftsteuer · Solidaritätszuschlag · Gewerbesteuer
2. **Welcher Zeitraum?** — abhängig von der Steuer:
   - USt monatlich → Monat-Picker (Dropdown „Mai 2026" usw.)
   - USt quartalsweise → Quartal-Picker („Q2 2026")
   - USt jährlich → Jahr-Picker
   - KSt/Soli/GewSt → Quartal-Picker („Q2 2026")
   - Default-Vorauswahl: aktuell offener / nächst-fälliger Posten dieser Art
3. **Bezahlter Betrag (€)** — vorausgefüllt mit dem geschätzten Betrag des passenden Postens, editierbar
4. **Datum** — Default heute, editierbar (date-input)
5. *(Optional)* **Notiz** — Textfeld, klein, kann leer bleiben

**Aktionen:**
- „Speichern" → Posten wird als bezahlt markiert (siehe unten)
- „Abbrechen"

### Wie wird das gespeichert

Das **bestehende `useBezahltMarkierungen`-Store** aus dem letzten Durchgang wird wieder aktiv genutzt:
- Bei Auswahl im Dialog wird die passende Posten-ID berechnet (`auto-ust-2026-M05`, `auto-kst-2026-Q2`, etc.)
- Eintrag in den Store: `{ bezahltAm: datum, tatsaechlicherBetrag: betrag, notiz?: notiz }`
- Die `BezahltMarkierung`-Schnittstelle wird um optionales `notiz` erweitert

In `steuern.tsx` wird wieder das Overlay aus `bezahltMap` über die generierten Posten gelegt (Logik aus dem Durchgang davor, war mit dem letzten Schritt rausgefallen).

### Was sich auf der Seite ändert

- **Posten-Liste**: bezahlte Posten verschwinden aus „Offene"-Listen und erscheinen in einer neuen Sektion **„Bereits bezahlt {jahr}"** unten — kleiner, dezenter, mit „Widerrufen"-Aktion (kleines X-Icon, kein großer Button)
- **Empfohlene-Rücklage-Karte**: Aufschlüsselung zeigt nur noch **offene** Beträge (= das, was noch zurückgelegt werden muss). Bezahlte Posten fließen nicht mehr ein.
- **Neue KPI „Bezahlt {jahr}"**: ersetzt eine der vier Kacheln. Vorschlag: KPIs in dieser Reihenfolge — *Empfohlene Rücklage · Nächste Fälligkeit · Bezahlt {jahr} · Gewinn YTD*
- **Detail-Dialog**: zeigt für bezahlte Posten zusätzlich Datum + Betrag + Notiz (falls vorhanden)

## 4. Zod-Validierung im Dialog

- Steuerart: Pflicht
- Zeitraum: Pflicht
- Betrag: > 0, max 9 Stellen
- Datum: gültiges ISO-Datum, nicht in ferner Zukunft (max heute + 30 Tage)
- Notiz: optional, max 200 Zeichen

## Technische Umsetzung — Dateien

- **Neu** `src/components/steuern/SteuerZahlungDialog.tsx` — der oben beschriebene Dialog
- **Geändert** `src/lib/steuern/store.ts` — `BezahltMarkierung` um optionales `notiz` erweitern
- **Geändert** `src/routes/steuern.tsx`:
  - Sparschwein + Texte aus Karte raus
  - Überschrift „Umsatzsteuer" ohne Rhythmus
  - Header-Action „Zahlung erfassen" wieder rein
  - `useBezahltMarkierungen` wieder aktiv, Overlay über generierte Posten
  - Bezahlte Posten in eigene Sektion + aus Rücklagen-Aufschlüsselung ausschließen
  - Neue KPI-Kachel „Bezahlt {jahr}"
- **Geändert** `src/components/steuern/SteuerDetailDialog.tsx` — bei `posten.bezahltAm` zusätzliche Info-Zeile mit Datum/Betrag/Notiz

Manueller `useManuellePosten`-Store bleibt komplett raus (keine „Steuer-Termin anlegen"-Funktion), wir tracken nur **Zahlungen** zu **automatisch generierten** Posten.

Bestätige, dann setze ich das in einem Rutsch um.
