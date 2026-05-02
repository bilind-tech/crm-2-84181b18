## Was ich beheben/ergänzen werde

### 1. Crash auf „Backup & Wiederherstellen" beheben (React error #310)

**Ursache gefunden:** In `src/components/einstellungen/BackupTab.tsx` wird der Hook `useMemo` (Zeile 127) **nach** einem frühen `return` (Zeile 114, `if (isLoading || !form || !data) return …`) aufgerufen. Das verletzt die Rules of Hooks — React wirft den minifizierten Fehler #310 → daher die rote „Something went wrong"-Seite.

**Fix:** `useMemo` für `letztes` **vor** den frühen Return verschieben (auf Basis der noch evtl. leeren Historie berechnen). Kein Verhaltensunterschied, nur korrekte Hook-Reihenfolge.

### 2. Rollback mit doppelter Bestätigung + Passwort

Aktuell startet `Rollback` direkt per Klick (`SystemUpdateTab.tsx`, Zeile 343 → `onRollback` → `rollback.mutate`). Das ist zu unsicher.

Neuer Flow:

```text
[Rollback-Knopf]
      ↓
[Schritt 1: Warn-Dialog]
  - Erklärt was passiert (Code zurück auf v1.x.y, Daten bleiben)
  - Listet was NICHT angefasst wird (alle Kunden/Rechnungen/Angebote)
  - „Weiter"  /  „Abbrechen"
      ↓
[Schritt 2: Passwort-Bestätigung]
  - Admin-Passwort eingeben (PasswordInput)
  - Bestätigungswort tippen: ROLLBACK
  - Beide Felder müssen korrekt → erst dann „Rollback starten"-Button aktiv
      ↓
[Backend prüft Passwort serverseitig]
  - Bei falsch: Fehlermeldung, Dialog bleibt offen
  - Bei richtig: Sicherheitsbackup → Rollback-Lauf startet
      ↓
[Live-Fortschrittsdialog wie beim Update]
```

Neue Komponente: `src/components/einstellungen/RollbackConfirmDialog.tsx` — analog zu `RestoreBackupDialog`, aber zusätzlich mit Passwortfeld.

`useRollbackUpdate` bekommt eine erweiterte Signatur: `mutate({ version, passwort })` statt nur `mutate(version)`. Das Mock-Backend akzeptiert vorerst jedes nicht-leere Passwort und gibt bei leerem Passwort einen simulierten 401-Fehler zurück (echte Prüfung kommt mit dem Pi-Backend).

### 3. Identische Sicherheits-Logik fürs Restore

Im `RestoreBackupDialog` wird zusätzlich zum Bestätigungswort `WIEDERHERSTELLEN` auch das **Admin-Passwort** verlangt — gleiche Begründung: extrem destruktive Aktion, darf niemals versehentlich passieren. (Konsistent mit Rollback.)

### 4. Daten-Schutz-Hinweise klar in der UI

In den Dialogen für **Restore**, **Rollback** und im **Update-Vorschau-Block** kommt ein gut sichtbarer Hinweis:

> **Deine Daten bleiben unberührt.**
> Kunden, Angebote, Rechnungen, Zahlungen, Anhänge und Einstellungen werden bei dieser Aktion **nicht** verändert, gelöscht oder überschrieben. Es wird ausschließlich der Programmcode getauscht. Vorher wird zusätzlich automatisch ein Sicherheitsbackup deiner Daten angelegt.

### 5. Backend-Anker (Code-Kommentare + Memory-Update)

Die Hinweise im Datei-Kopf von `SystemUpdateTab.tsx` werden um den Rollback-Vertrag erweitert:

- Rollback-Endpunkt erfordert **Admin-Passwort-Verifikation** (bcrypt-Vergleich serverseitig, nie clientseitig).
- Rollback darf **niemals** das Daten-Verzeichnis (`/var/lib/mycleancenter/`) anfassen — weder lesen-mit-Lock noch schreibend.
- Vor jedem Rollback wird ein `pre-rollback-{ts}.sqlite.gz` erstellt (analog zu `pre-update`/`pre-restore`).
- Bei jedem Fehler im Rollback-Pfad: Service mit altem Code weiterlaufen lassen, niemals halb-getauscht aussteigen.

Memory-Datei `mem://features/system-update` wird um die Rollback-Sektion ergänzt (gleiche absolute Regel: Daten unantastbar).

## Nicht im Scope

- Echtes Backend (kommt später auf dem Pi).
- Echte Passwort-Hashes (Mock akzeptiert vorerst alles ≠ leer; echte Prüfung mit dem Pi).
- Login-Bildschirm/Auth-Flow generell — hier nur Re-Auth für die destruktive Aktion.

## Technische Details (kurz)

| Datei | Änderung |
|---|---|
| `src/components/einstellungen/BackupTab.tsx` | `useMemo`-Aufruf vor frühen Return verschieben → behebt React #310 |
| `src/components/einstellungen/RollbackConfirmDialog.tsx` | **neu** — 2-Schritt-Dialog mit Passwortfeld + Bestätigungswort `ROLLBACK` |
| `src/components/einstellungen/SystemUpdateTab.tsx` | „Rollback"-Button öffnet neuen Dialog statt direkt zu mutieren; Daten-Schutz-Hinweis im Update-Vorschau-Block ergänzen |
| `src/components/einstellungen/RestoreBackupDialog.tsx` | Zusätzliches Passwort-Feld + Daten-Schutz-Hinweis |
| `src/hooks/useApi.ts` | `useRollbackUpdate` und `useRestoreBackup` akzeptieren `{version/id, passwort}` |
| `src/lib/mock/backend.ts` | Akzeptiert/leitet Passwort weiter; simulierter 401-Fehler bei leerem Passwort; erzeugt `pre-rollback`-Backup |
| `mem://features/system-update` | Rollback-Vertrag + Passwort-Pflicht + Daten-Unantastbarkeit ergänzen |

Nach Freigabe setze ich das in einem Rutsch um.
