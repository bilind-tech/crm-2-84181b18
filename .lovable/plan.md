## Ziel

Neuer Bereich **Einstellungen → Import** mit großem Textfeld, in das du dein JSON aus dem alten CRM einfügst. Per Klick werden alle Kunden samt Ansprechpartner sauber in die Datenbank übernommen — `null`-Werte werden korrekt als „leer" behandelt.

## Feld-Mapping

| JSON-Feld           | Ziel im System                                                | Hinweis |
|---------------------|---------------------------------------------------------------|---------|
| `firmenname`        | `firmenname`                                                  | bei `null` → leer; wenn auch kein Ansprechpartner → Fallback „Unbekannt" damit Liste nicht leer wirkt |
| `adresse`           | `strasse`                                                     | 1:1 |
| `plz`               | `plz`                                                         | 1:1 |
| `ort`               | `ort`                                                         | 1:1 |
| `rechnungskuerzel`  | `kuerzel`                                                     | Dein bekanntes Kürzel-System; Kollisionen werden gemeldet |
| `vertragsdatum`     | wird in **Notiz** geschrieben: „Vertrag seit …"               | Formate `TT.MM.JJJJ` und `MM.JJJJ` werden erkannt |
| `ansprechpartner`   | neuer Ansprechpartner (primär), Name gesplittet in Vor/Nach   | nur wenn nicht `null` |
| `gender`            | `anrede` des Ansprechpartners (Male→Herr, Female→Frau)        | nur wenn nicht `null` |

`typ` wird auf `firma` gesetzt, `status` auf `aktiv`, alle übrigen Felder bleiben leer / Default — du kannst sie später wie gewohnt ergänzen.

## UI (Einstellungen → Import)

1. Neuer Tab **„Import"** in der Sub-Sidebar (Gruppe „Stammdaten"), Icon „Upload".
2. Großes Textfeld (Monospace) für das JSON.
3. Button **„Vorschau prüfen"**: validiert JSON lokal, zeigt eine Tabelle mit allen Kunden + Status pro Zeile (✅ OK / ⚠ Kürzel-Konflikt / ⚠ Felder leer). Zeigt Gesamtanzahl.
4. Button **„Import starten"** (erst aktiv nach erfolgreicher Vorschau):
   - Fortschrittsanzeige „X von Y".
   - Pro Kunde: erst `POST /kunden`, danach bei vorhandenem Ansprechpartner `POST /ansprechpartner`.
   - Ergebnis-Liste am Ende: erfolgreich angelegt, übersprungen (mit Grund), fehlgeschlagen (mit Fehlertext).
5. Hinweis-Box oben: „Dieser Import legt Kunden **neu** an. Bei Kürzel-Konflikten wird der betroffene Kunde übersprungen — du kannst das JSON anpassen und erneut importieren."

## Technisch (kurz)

- Neue Komponente `src/components/einstellungen/ImportTab.tsx`.
- Tab-Eintrag in `src/routes/einstellungen.tsx` + neue Sub-Route `einstellungen.import.tsx` (analog zu den anderen Tabs).
- Parser/Mapper in `src/lib/import/kundenImport.ts` (rein clientseitig, ruft bestehende API-Endpunkte `POST /kunden` und `POST /ansprechpartner`).
- **Keine Backend-Änderung nötig** — die vorhandenen Endpunkte reichen vollständig.

## Offene Punkte / Annahmen

- Ich nehme an: **immer neue Kunden anlegen**, kein „Update bei gleichem Kürzel". Sag Bescheid, falls du lieber eine Update-Logik möchtest.
- `vertragsdatum` landet als Notiz am Kunden — falls du dafür ein echtes Feld haben willst, müssten wir die Datenbank erweitern. Sag Bescheid.
