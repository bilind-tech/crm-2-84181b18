## Ursache

Der systemd-Service `mycleancenter` läuft mit `Environment=NODE_ENV=production`. Diese Variable wird an alle vom Backend gespawnten `npm`-Prozesse vererbt. npm interpretiert `NODE_ENV=production` standardmäßig als `--omit=dev` — auch bei `npm install`. Dadurch werden devDependencies wie `@vitejs/plugin-react`, `vite`, `@tailwindcss/vite`, `@tanstack/router-plugin` etc. **nicht** installiert. Der anschließende `npm run build:spa` bricht dann ab mit:

```
Cannot find package '@vitejs/plugin-react'
```

Das `npm install` selbst läuft erfolgreich durch (deshalb keine Fehlermeldung in „Abhängigkeiten installieren"), nur die devDeps fehlen still.

## Fix

In `backend/src/system/runner.ts` für den **Frontend**-Install-Schritt explizit devDependencies erzwingen. Zwei kombinierte Maßnahmen (Gürtel + Hosenträger):

1. `npmInstallTolerant()` um optionales Env-Override erweitern.
2. Beim Frontend-Aufruf `--include=dev` **und** `NODE_ENV=development` setzen.

### Änderungen

**`npmInstallTolerant()`** — neuer optionaler Parameter `env?: Record<string,string>`, wird an `execFileP` als `env: { ...process.env, ...env }` übergeben.

**Frontend-Install (Zeile ~538):**
```ts
const fe = await npmInstallTolerant(
  versionRoot,
  ["--include=dev"],
  "Frontend-Dependencies",
  { NODE_ENV: "development" },
);
```

Backend-Install (`npmInstallWithFallback` mit `--omit=dev`) bleibt unverändert — dort sollen devDeps ja gerade nicht rein.

### Warum beides

- `--include=dev` überschreibt `--omit=dev`-Default in den meisten npm-Versionen.
- `NODE_ENV=development` ist der harte Fallback für ältere npm-Versionen, bei denen `--include=dev` ignoriert wird, wenn die Env-Variable gesetzt ist.

## Test / Rollout

1. Patch committen + pushen.
2. Auf dem Pi den manuellen Update-Befehl von vorhin ausführen (holt neuen Runner-Code).
3. Danach Update-Button in der App testen — Frontend-Build muss durchlaufen, `dist/index.html` entstehen, Healthcheck grün.

Daten-Verzeichnis bleibt unangetastet, Sicherheits-Backup wird wie gewohnt vor jedem Versuch erstellt — kein Risiko für Bestandsdaten.
