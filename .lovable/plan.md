## Ausgangslage

Der System-Update-Flow ist im Backend bereits zu ~80 % implementiert (Manifest-HMAC, Zip-Bomb-Schutz, atomarer Symlink-Swap, Auto-Rollback, Lock-File, Sicherheits-Backup, Healthcheck) und im Frontend mit Upload + Live-Dialog. Es fehlen jedoch mehrere harte Garantien rund um **Datenschutz, Absicherung des Rollbacks und UX-Robustheit**, die wir jetzt schließen.

## Ziele dieser Runde

1. **Daten-Verzeichnis ist im gesamten Update-Flow garantiert tabu** (Boot-Check + Pfad-Guard greift für JEDE FS-Mutation des Runners).
2. **Validierung greift früher und vollständiger** (Migrations-Diff vor Install statt TODO; Manifest-Allowlist von Top-Level-Pfaden; Klartext-Warnung wenn `data/`, `keys/`, `backups/` im ZIP).
3. **Rollback-Ordner-Politik ist deterministisch** (`current` / `previous` immer konsistent, `broken-*` mit klarer Retention, manueller Rollback nur direkter Vorgänger).
4. **Live-Step-UI bleibt verlässlich** (SSE-Reconnect → Lauf wird neu geladen, Polling-Fallback, korrekte Cache-Invalidierung).
5. **Kein Fehler im Rollback-Pfad bleibt unentdeckt** (Rollback-eigener Lauf, eigener Health-Loop, Audit + Recovery-Hinweis).

## Schritte

### 1. Daten-Schutz wirklich erzwingen
- `data-guard.assertCodeAndDataSeparated()` in `server.ts` direkt nach `loadConfig()` aufrufen (vor jedem DB-/FS-Open). Hard-Fail beendet Boot.
- In `system/runner.ts` jeden FS-Mutationspfad (`renameSync`, `symlinkSync`, `unlinkSync`, `rmSync`, `mkdirSync`) durch einen kleinen Helper `safeFs` schleusen, der zuerst `assertNotInDataDir(target, op)` ruft. Damit ist eine Daten-Berührung nicht "ein TODO weglassen" sondern technisch unmöglich.
- `extractZipSafe` zusätzlich härten: explizite Allowlist von Top-Level-Verzeichnissen (`dist/`, `node_modules/` darf NICHT mit, `package.json`, `package-lock.json`, `manifest.json`, `migrations/`). Alles außerhalb → `ZipError`.
- Beim `quarantaene`-Step vor dem `renameSync(stagedRoot, targetVersionDir)` `assertNotInDataDir(targetVersionDir)` ergänzen.

### 2. Validate-Step liefert echten Migrations-Diff
- Neue Funktion `system/migrations-diff.ts`: liest `extractDir/dist/db/migrations/*.sql`, vergleicht mit `pragma user_version` + ausgeführten Migrationen aus DB-Tabelle. Liefert `{pending: string[], downgrade: boolean}`.
- Im `/system/update/validate`-Handler statt `pendingMigrations: []` echten Diff zurückgeben. Bei `downgrade=true` → `valide=false` mit klarer Begründung.
- Frontend zeigt das schon korrekt (`UpdatePackagePreview`), keine UI-Änderung nötig — nur ehrliche Daten.

### 3. Quarantäne / Symlink-Swap deterministischer
- `previousLink()` IMMER neu setzen (auch wenn `old===null`, dann `previous` löschen). Aktuell verbleibt sonst ein veraltetes `previous` nach erstem Update.
- Vor Swap einmalig `readCurrentTarget()` cachen; wenn der Cache nach Swap NICHT mehr `===targetVersionDir` ist, sofort Auto-Rollback.
- Bei Rollback (auto + manuell): defekte Version landet in `versions/broken-<stamp>/`, NIE löschen wir `previous` selbst.

### 4. Cleanup-Politik
- `cleanupOldVersions()`: 
  - `current`, `previous` → niemals löschen.
  - 1 weitere historische Version (drittälteste) behalten ("Notnagel").
  - `broken-*` älter 7 Tage → löschen.
  - Alles andere → löschen.
- Staging-Reste (`staging/<uploadId>/`) älter 1 h aufräumen — neuer Cron in `server.ts` (`setInterval` 30 min).

### 5. Manueller Rollback abgesichert
- Backend prüft jetzt schon "Zielversion existiert"; zusätzlich:
  - Nur `targetVersion === basename(previousLink())` ist erlaubt → 400 sonst. Damit kein "drei Versionen zurück"-Sprung.
  - Healthcheck-Fail im Rollback-Lauf → Status `fehler` (nicht `rollback`), Audit `system.update.rollback_smoketest_fehler`, UI zeigt rote Banner-Box mit Anweisung "Pi neu starten".
- Lockout (3 Fehlversuche → 15 min) bleibt; zusätzlich Audit pro Versuch.

### 6. Live-Step-UI härten
- `useLiveEvents` für `system:update:phase` invalidiert bereits `["system","update","lauf",laufId]` — sicherstellen dass `["system","update","lauf","aktuell"]` ebenfalls invalidiert wird, damit ein Reload-Mid-Update den Dialog wieder einblendet.
- Im `UpdateProgressDialog`: bei SSE-Disconnect (über `onSseStatus`) Polling auf 2 s reduzieren; bei `connected` zurück auf SSE-only.
- Schließen-Knopf während `status==="laeuft"` deaktivieren — verhindert versehentliches Schließen, wenn ein User denkt es hängt.
- Ein neuer `OperationLockBanner` oben im Tab, wenn `isUpdateRunning` (über `useAktuellerUpdateLauf`) — blockiert Upload/Rollback-Buttons, statt nur Toast.

### 7. Recovery-Pfade
- `reapStaleLock()` beim Boot loggt Audit `system.update.lock_recovered` und schreibt einen "letzter Lauf wurde unterbrochen"-Eintrag, falls in DB ein Lauf mit `status="laeuft"` hängt → wird auf `fehler` gesetzt mit Begründung "Backend-Restart während Update". Frontend zeigt das in der Historie als roter Eintrag, mit Button "Sicherheits-Backup wiederherstellen" (verlinkt in Backup-Tab, vorausgewählt).
- Frontend `ErrorRecoveryHint`: Wird nach `status==="fehler"` UND `safetyBackupId` gezeigt → "Sicherheits-Backup XYZ wurde vorher angelegt. Wiederherstellen?".

### 8. Tests / Dev-Hilfen (kurz)
- Kleines CLI-Skript `backend/scripts/build-test-pakete.ts` (nur Dev), das ein gültig signiertes Test-ZIP gegen `dev-root/` baut — manuelle Smoke-Test des Flows ohne Pi.

## Technisches Detail

```text
/opt/mycleancenter/                 ← appRoot()
  current   ──► versions/2026-05-03T10-12-00-000Z/   (symlink)
  previous  ──► versions/2026-04-28T22-08-13-000Z/   (symlink)
  staging/<uploadId>/extract/...                     (entpacktes ZIP)
  staging/.install.lock                              (PID-Lock)
  versions/
    2026-05-03T10-12-00-000Z/   ← jetzt aktiv
    2026-04-28T22-08-13-000Z/   ← previous
    broken-2026-04-15T...       ← evtl. Reste, 7-Tage-Retention
/var/lib/mycleancenter/            ← config.dataDir  (data-guard NIEMALS schreibbar im Update)
  app.sqlite, backups/, keys/master.key, drive-token.enc
```

State-Diagramm Update-Lauf:
```text
entpacken → backup → quarantaene → install → migrations → neustart → smoketest → ✓erfolg
                          │            │          │           │           │
                          ▼            ▼          ▼           ▼           ▼
                       (vor Swap: einfach abbrechen, kein Rollback nötig)
                                       │
                                       └─ ab hier Auto-Rollback: rollback-Step → swap zurück → broken-* sichern
```

Geänderte/neue Dateien (Backend):
- `backend/src/server.ts` — Boot-Guard + Stale-Lauf-Recovery + Staging-Cleanup-Cron.
- `backend/src/system/runner.ts` — `safeFs`-Wrapper, Allowlist-Validate, deterministisches `previous`, manueller-Rollback nur direkter Vorgänger, Healthcheck-Fail im Rollback hart.
- `backend/src/system/zip.ts` — Top-Level-Allowlist erweitern.
- `backend/src/system/migrations-diff.ts` (neu) — echter Diff.
- `backend/src/system/repo.ts` — `markStaleLaeufeAlsFehler()`.
- `backend/src/routes/system.ts` — `/validate` füllt `pendingMigrations`; Rollback prüft "nur direkter Vorgänger".

Frontend:
- `src/components/einstellungen/SystemUpdateTab.tsx` — `OperationLockBanner`, Schließen-Sperre, Recovery-Hinweis nach `fehler`.
- `src/components/einstellungen/UpdateProgressDialog.tsx` — SSE-Disconnect-Polling-Fallback.
- `src/hooks/useLiveEvents.ts` — `system:update:phase` invalidiert auch `["system","update","lauf","aktuell"]`.

Keine DB-Migration erforderlich — `system_update_lauf` reicht aus, nur Status-Update bestehender Zeilen.

## Garantien nach dieser Runde

- Daten-Verzeichnis kann durch Code-Update **technisch** nicht angefasst werden (Boot-Check + Pfad-Guard + ZIP-Allowlist).
- Vor jedem destruktiven Schritt liegt ein Sicherheits-Backup mit fester ID, die im Lauf gespeichert ist und im UI verlinkt wird.
- Fehler vor Symlink-Swap → System ist 100 % unverändert.
- Fehler nach Symlink-Swap → automatischer Rollback auf `previous`, defekte Version in `broken-*` archiviert.
- Manueller Rollback ist nur auf `previous` möglich, passwortgeschützt, mit Lockout.
- Backend-Crash mitten im Update → beim nächsten Start Lock entfernt, hängender Lauf als `fehler` markiert, UI bietet Restore an.

Sag „weiter", dann setze ich Schritt 1–4 (Backend-Hardening + Validate-Diff) um, danach 5–7 (Rollback + UI).
