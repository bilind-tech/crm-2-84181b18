## Änderungen

### 1. Footer: rechter Block rechtsbündig
Im PDF-Footer (4 Spalten) wird die **vierte/letzte Spalte** (Handelsregister, USt-ID, Webseite) rechtsbündig ausgerichtet. Linke und mittlere Spalten bleiben unverändert (links bzw. zentriert).

**Dateien:**
- `src/lib/pdf/belegPdf.ts` — Funktion `footer()` Zeile 226: `cell(...)` Helper erweitern, sodass `alignment` auch `"right"` akzeptiert; vierte Spalte mit `"right"` aufrufen.
- `backend/src/pdf/layout.ts` — analog in `footer()` Zeile 100.

### 2. Kürzel-Längen-Einschränkung entfernen
Beliebige Länge (auch 1–2 Zeichen) erlauben. Leeres Kürzel bleibt zulässig.

**Dateien:**
- `backend/src/kunden/kuerzel.ts` — Regex von `^[A-Z0-9]{3,4}$` → `^[A-Z0-9]+$` (mind. 1 Zeichen, nach oben offen).
- `src/components/forms/KundeForm.tsx`:
  - Live-Konflikt-Check und Vorschau-Trigger: `f.kuerzel.length >= 3` → `f.kuerzel.length >= 1` (alle 4 Vorkommen Zeile ~152, ~390, ~392, ~420).
  - Submit-Validierung Zeile 190–193 (Fehler bei `<3`) komplett entfernen.

### Nicht betroffen
- Belegnummern-Format funktioniert weiterhin (Kürzel wird einfach in beliebiger Länge eingesetzt).
- Eindeutigkeit pro Kürzel bleibt erhalten.
- Restlicher Footer (Firmenname/Bank/Telefon-Spalten) unverändert.
