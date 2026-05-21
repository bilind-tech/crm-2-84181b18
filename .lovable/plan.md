## Problem

Im **Preview-/Demo-Modus** (kein laufendes Pi-Backend erreichbar) verhält sich die Firmendaten-Seite genau wie beschrieben:

- **GET `/einstellungen/firma`** liefert in `localPreviewData.ts` immer die **statische Konstante** `previewFirma` zurück (Zeile 376).
- **PATCH `/einstellungen/firma`** hat in `localPreviewMutate` **keinen Handler** (Zeile 381–627) → Aufruf fällt durch auf den realen `fetch(getBackendUrl()+path)`, der ohne erreichbares Backend einen Netzwerkfehler wirft.
- Folge: Beim Klick auf „Speichern" wird die Änderung verworfen. Sobald das Query erneut lädt (Tab-Wechsel, Window-Focus, Re-Render), läuft `useEffect(() => setForm(initial), [initial])` und überschreibt das Formular wieder mit `previewFirma` — Webseite leer, Firmenname zurück auf den hardcodierten Default `"My Clean Center"` (ohne „GmbH", ohne Leerzeichen-Korrektur).

Das **echte Pi-Backend** macht das korrekt: `backend/src/settings/schemas.ts` nutzt `z.string().trim()` (erhält interne Leerzeichen), und `backend/src/routes/einstellungen.ts` mappt `firmenname↔name` / `webseite↔web` sauber in beide Richtungen. Der Test `backend/test/firma-settings.spec.ts` beweist Roundtrip inkl. Leerzeichen und Webseite. System-Updates ersetzen laut Architektur nur Code in `/opt/mycleancenter/current/`, niemals Daten in `/var/lib/mycleancenter/` — gespeicherte Werte bleiben über Updates erhalten.

## Lösung

### 1. `src/lib/api/localPreviewData.ts` — Firma im Preview-Store persistieren

- `previewFirma.firmenname` korrigieren von `"My Clean Center"` auf `"My Clean Center GmbH"` (passend zum Backend-Default, mit Leerzeichen).
- Im Preview-Store eine optionale `firma?: Firmendaten`-Property halten.
- GET-Handler ändern: `return store.firma ?? previewFirma`.
- PATCH-Handler hinzufügen für `/einstellungen/firma`:
  - Body als `Partial<Firmendaten>` interpretieren
  - mit aktuellem Wert (`store.firma ?? previewFirma`) mergen
  - in `store.firma` schreiben und Store speichern
  - gemergten Datensatz zurückgeben

Damit speichert das Formular im Preview-Modus zuverlässig — Webseite bleibt erhalten, Firmenname mit Leerzeichen bleibt erhalten, auch über Tab-Wechsel/Refresh.

### 2. Verifikation am echten Pi-Backend

Keine Code-Änderung nötig. Nach Deployment einmal prüfen:

- Auf dem Pi: `sqlite3 /var/lib/mycleancenter/data.db "SELECT value FROM setting WHERE key='firma';"` — wenn dort ein alter Wert wie `"name":"MyCleanCenter GmbH"` steht, einmal in der UI auf `"My Clean Center GmbH"` korrigieren und speichern. Der Wert bleibt dann über alle weiteren Updates erhalten.

## Nicht geändert

- `backend/src/settings/schemas.ts`, `backend/src/routes/einstellungen.ts`, `backend/src/pdf/firma.ts` — bereits korrekt, Tests bestätigen.
- Update-Logik — fasst Daten-Verzeichnis nicht an (Projekt-Regel).
- Memory-Regeln bleiben unverändert.
