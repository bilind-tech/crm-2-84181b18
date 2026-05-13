## Ziel

Der GitHub-Bereich in **Einstellungen → System & Updates** soll wie ein „normaler Verbinden-Schalter" funktionieren — vergleichbar mit Google Drive:

1. **Einmal** Repository + (optional) Token eingeben → **Verbinden** → ist gespeichert.
2. Danach steht **dauerhaft** „Verbunden mit `besitzer/repo`" — auch nach Reload, Geräte­wechsel und Neustart.
3. Repo / Branch / Token lassen sich jederzeit über **„Bearbeiten"** ändern, ohne neu verbinden zu müssen.
4. Mit **einem Klick** auf „Jetzt aktualisieren" zieht der Pi den neuesten Code, und die UI sagt klar: „läuft …", „erfolgreich" oder „fehlgeschlagen — Grund X".

Backend und Datenmodell sind bereits vorhanden (`/system/github/status|verbinden|trennen|pruefen|install`, Token verschlüsselt im Settings-Store). Der Plan ist eine **UI-/UX-Überarbeitung** plus zwei kleine Robustheits-Korrekturen — keine Änderungen am Update-Runner, keine Datenmigrationen.

---

## Was geändert wird

### 1. Neue, klare Verbindungs-Karte (`GitHubUpdateCard.tsx`)

Drei eindeutige Zustände, kein Mischmasch mehr:

```text
┌─ Zustand A: Nicht verbunden ───────────────────────────┐
│  [GitHub-Icon]  Mit GitHub verbinden                   │
│  Einmalig Repository hinterlegen, danach 1-Klick-      │
│  Updates direkt vom Pi.                                │
│                              [ Verbinden ]             │
└────────────────────────────────────────────────────────┘

┌─ Zustand B: Verbunden, kein Update ────────────────────┐
│  ● Verbunden  ·  besitzer/repo  (main)    [Bearbeiten] │
│  Auf dem neuesten Stand · zuletzt geprüft vor 3 min    │
│  Installiert: a1b2c3d                                  │
│                                                        │
│  [ Auf Updates prüfen ]                                │
└────────────────────────────────────────────────────────┘

┌─ Zustand C: Verbunden, Update verfügbar ───────────────┐
│  ● Verbunden  ·  besitzer/repo  (main)    [Bearbeiten] │
│  Update verfügbar: e4f5g6h  „Fix CSP …"                │
│                                                        │
│  [ Prüfen ]              [ Jetzt aktualisieren ]       │
└────────────────────────────────────────────────────────┘
```

- „Verbunden"-Pille bleibt **persistent grün** sobald `status.repo` gesetzt ist (Token ist optional bei public Repos — gleiche Regel wie Backend).
- „Bearbeiten" öffnet denselben Dialog wie „Verbinden", vorbefüllt mit aktuellen Werten. Token-Feld leer = vorhandenen Token behalten (steht schon in der Backend-Route, wird in der UI klar beschriftet).
- „Trennen" wandert in den Bearbeiten-Dialog (sekundärer, dezenter Button unten links) — nicht mehr neben „Prüfen". So ist die Hauptfläche nur noch „Status + Aktion".

### 2. Robusteres Verbinden (`GitHubVerbindenDialog.tsx`)

- **Live-Statuszeile** im Dialog: nach Klick auf „Speichern & testen" zeigt die Karte sofort
  - „Speichere …"
  - „Teste Zugriff auf `besitzer/repo` …"
  - ✅ „Verbunden — neuester Commit `a1b2c3d`"  oder  ❌ konkreter Fehler (404 = Repo existiert nicht, 401 = Token ungültig, 403 = Rate-Limit / Scope fehlt).
- Dialog schließt **nur** bei Erfolg automatisch. Bei Fehler bleibt offen, Eingaben bleiben stehen, Toast + Inline-Hinweis erklären den Fehler.
- Branch-Default `main` bleibt, Auto-Check-Switch bleibt. Keine neuen Felder.

### 3. Update mit klarem Erfolgs-/Fehler-Feedback

- „Jetzt aktualisieren" startet wie heute den Lauf und öffnet den bestehenden `UpdateProgressDialog` (Live-Steps via SSE).
- **Neu nach Lauf-Ende**:
  - Erfolg → großer grüner Banner in der Karte: „Update erfolgreich auf `e4f5g6h` (vor 12 s) — Seite neu laden, um die neue Version zu sehen" + Button „Jetzt neu laden". Bleibt sichtbar bis Reload.
  - Fehler → roter Banner mit konkretem Step-Fehler aus dem Lauf (z. B. „Schritt: Backup — kein Speicherplatz") + Button „Details".
- Status-Karte invalidiert sich nach Lauf-Ende automatisch (`queryClient.invalidateQueries(['github','status'])`), so dass „Installiert"-SHA sofort den neuen Wert zeigt.

### 4. Persistenz-/Sichtbarkeits-Härtungen (kleine Bugs ausschließen)

- **Frontend-Hook `useGithubStatus`**: `staleTime` kurz halten (15 s) und beim Tab-Mount immer einmal frisch ziehen, damit die Karte nach einem Reload sofort den verbundenen Zustand zeigt — nicht erst nach manuellem „Prüfen".
- **Backend-Sanity-Check** (nur lesend, keine Migration): in `buildStatus` sicherstellen, dass `tokenIsSet`/`repo` aus den persistierten Settings gelesen werden, auch wenn der erste Remote-Check fehlschlägt — die UI darf trotz „GitHub gerade nicht erreichbar" weiterhin „Verbunden" zeigen, mit kleinem Warnhinweis „letzter Fehler: …". So „verschwindet" die Verbindung nie wegen einer Netz-Macke.
- **Beim Bearbeiten ohne Token-Eingabe**: Dialog zeigt Hinweis „Vorhandener Token bleibt erhalten" (heute schon vorhanden, prominenter machen). Backend bleibt unverändert (`token` ist `optional`).

### 5. Keine Mehrfach-Effekte / kein Datenrisiko

- Es werden **keine** Backend-Routen geändert, **keine** Migrationen, **keine** Update-Runner-Logik angefasst.
- Datenverzeichnis bleibt tabu (Memory-Regel). Update-Pfad ist identisch zur ZIP-Pipeline.

---

## Geänderte Dateien

- `src/components/einstellungen/GitHubUpdateCard.tsx` — neue Drei-Zustands-Darstellung, Erfolg/Fehler-Banner nach Lauf, „Trennen" in Edit-Dialog verschoben.
- `src/components/einstellungen/GitHubVerbindenDialog.tsx` — Live-Test-Status, Fehler bleibt offen, „Trennen"-Button im Edit-Modus, klarere Token-Beschriftung.
- `src/hooks/useApi.ts` — `useGithubStatus`: `staleTime: 15_000`, `refetchOnMount: 'always'`, Invalidierung nach `useGithubInstall` / `useGithubVerbinden` / `useGithubTrennen`.
- `backend/src/system/github-source.ts` — `buildStatus`: bei Remote-Fehler trotzdem `repo`/`branch`/`tokenIsSet`/`installedCommit` aus Settings zurückgeben, `letzterFehler` füllen, statt zu werfen. (Nur defensiver Read-Pfad, keine Verhaltensänderung beim Schreiben.)

---

## Akzeptanz­kriterien (so prüfst du es)

1. Repo eintragen → „Verbinden" → Toast „Verbunden mit besitzer/repo@a1b2c3d", Karte zeigt grünen „Verbunden"-Status.
2. Browser-Reload → Karte zeigt **sofort** „Verbunden", ohne Klick.
3. Auf anderem Gerät im LAN einloggen → ebenfalls „Verbunden" (kommt aus Pi-Settings).
4. „Bearbeiten" → Branch ändern → „Speichern" → neuer Branch sichtbar, kein erneuter Token nötig.
5. „Jetzt aktualisieren" → Live-Steps → am Ende grüner Banner „Update erfolgreich auf SHA xy" + „Neu laden".
6. Pi während Prüfung kurz offline → Karte bleibt „Verbunden", zeigt nur kleinen Hinweis „letzter Check fehlgeschlagen".
7. „Trennen" (jetzt im Edit-Dialog) → Karte fällt auf Zustand A zurück, Token gelöscht.
