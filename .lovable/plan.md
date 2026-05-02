# Step 13 — Mahn-Automatik & Steuern-Store ans Backend

Nach Step 12 sind alle großen Daten-Bereiche (Belege, Dokumente, Email, Drive, Backups, System) auf dem Pi. **Zwei Lücken bleiben:**

1. **Mahnwesen läuft nur „auf Knopfdruck"** — `MahnSektion` zeigt zwar die nächste empfohlene Stufe, aber niemand drückt auf Pi-Seite den Knopf. Sobald der Pi 24/7 läuft, soll Mahnung **automatisch** rausgehen (oder zumindest als Vorschlag in der Benachrichtigung landen).
2. **Steuer-Termine + Konfiguration leben noch in `localStorage`** (`src/lib/steuern/store.ts`) — gerätegebunden, nicht synchron, kein Backup. Muss in SQLite.

Step 13 schließt beides ab.

---

## Teil A — Mahn-Automatik im Backend

### Datenmodell — Migration `014_mahn_automatik.sql`

```sql
CREATE TABLE mahn_laeufe (
  id TEXT PRIMARY KEY,
  gestartet_am TEXT NOT NULL DEFAULT (datetime('now')),
  beendet_am TEXT,
  geprueft INTEGER NOT NULL DEFAULT 0,    -- Anzahl Rechnungen
  vorschlaege INTEGER NOT NULL DEFAULT 0, -- nur als Hinweis erzeugt
  versendet INTEGER NOT NULL DEFAULT 0,   -- automatisch verschickt
  fehler INTEGER NOT NULL DEFAULT 0,
  ausgeloest_durch TEXT NOT NULL CHECK (ausgeloest_durch IN ('cron','manuell'))
);

CREATE TABLE mahn_lauf_eintraege (
  id TEXT PRIMARY KEY,
  lauf_id TEXT NOT NULL REFERENCES mahn_laeufe(id) ON DELETE CASCADE,
  rechnung_id TEXT NOT NULL,
  stufe INTEGER NOT NULL,
  aktion TEXT NOT NULL CHECK (aktion IN ('vorschlag','versendet','uebersprungen','fehler')),
  grund TEXT,
  email_versand_id TEXT,
  erstellt_am TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_mahnlauf_rechnung ON mahn_lauf_eintraege(rechnung_id);
```

Plus Erweiterung der bestehenden `MahnEinstellungen` (settings-Tabelle, Key `mahnung`):

```ts
{
  // bisher:
  autoVorschlagAktiv: boolean,
  stufen: MahnStufeConfig[],
  // NEU:
  modus: "aus" | "vorschlag" | "auto",        // auto = direkt versenden
  cronZeit: string,                            // "08:30" Pi-Zeit
  nurAnWerktagen: boolean,                     // Mo–Fr
  pauseNachStufe1Tage: number,                 // Mindestabstand zwischen autoversendeten Stufen
  benachrichtigungBeiVorschlag: boolean,       // Push-Notification + SSE
  benachrichtigungBeiAutoversand: boolean,
}
```

Default-Migration: bestehende User → `modus: "vorschlag"` (kein Überraschungs-Versand).

### Logik — `backend/src/mahnung/`

| Datei | Zweck |
|---|---|
| `regeln.ts` | 1:1-Port von `src/lib/mahnung/regeln.ts` (Frontend-Datei wird zur Anzeigelogik degradiert oder importiert via `useApi`-Hook ein Result vom Backend). |
| `repo.ts` | `mahn_laeufe` + `mahn_lauf_eintraege` CRUD; `letzterLaufFuer(rechnungId)`. |
| `automatik.ts` | Hauptjob: lädt offene Rechnungen, ruft `bestimmeMahnZustand`, entscheidet je `modus`. Bei `auto`: erzeugt `EmailVersand`-Eintrag (existierender Worker übernimmt Versand) + neuen `mahnungen[]`-Eintrag in der Rechnung + `aktivitaet`-Log + SSE `mahnung:erstellt`. Bei `vorschlag`: nur Benachrichtigung. |
| `cron.ts` | `node-cron`-Schedule, Zeit aus Settings, Werktagsfilter. Defensive: `if (running) return`. |

### Routen — `backend/src/routes/mahnung.ts`

| Method | Pfad | Zweck |
|---|---|---|
| GET | `/mahnung/status` | nächster Cron-Lauf, letzter Lauf, aktuelle Vorschläge |
| GET | `/mahnung/laeufe` | Liste der letzten 30 Läufe |
| GET | `/mahnung/laeufe/:id` | Detail mit Einträgen |
| POST | `/mahnung/jetzt-pruefen` | Lauf manuell triggern (mit `modus`-Override für Dry-Run) |
| POST | `/rechnungen/:id/mahnung-versenden` | Stufe X manuell senden (ersetzt heutigen Frontend-Pfad — Email-Worker macht den Rest) |

Letzteres ist die Backend-Variante des heutigen `MahnSektion → EmailVersandDialog`-Flows: Frontend baut Email zusammen, Backend speichert Versand + erzeugt sofort den `mahnungen`-Eintrag in der Rechnung (Stufe + Frist) **transaktional**.

### Cron-Integration

`backend/src/server.ts` startet den neuen Scheduler analog zu `startFristenScheduler`. Beim Speichern der Settings (`PUT /einstellungen/mahnung`) wird der Cron neu registriert (`reloadMahnCron(zeit, werktagsFilter)`).

---

## Teil B — Frontend-Anpassung Mahnwesen

- **`src/lib/mahnung/regeln.ts`**: bleibt als reine Anzeige-Hilfsfunktion (zeigt im UI „Empfehlung Stufe 2 in 3 Tagen"), nutzt aber Backend-Daten für Historie.
- **`src/components/mahnung/MahnwesenTab.tsx`**: neuer Bereich „Automatik-Status"
  - aktueller Modus, nächster Cron-Lauf, letzter Lauf-Bericht
  - Toggle Modus aus/vorschlag/auto, Zeit-Picker, Werktagsfilter
  - „Jetzt prüfen"-Button → `POST /mahnung/jetzt-pruefen`
  - Liste „Letzte 5 Läufe" mit Drill-Down
- **`src/components/dashboard/NaechsteSchritteCard.tsx`**: zieht Mahnvorschläge aus `/mahnung/status` statt clientseitig zu rechnen.
- **`src/components/mahnung/MahnSektion.tsx`**: „Senden"-Button ruft jetzt `POST /rechnungen/:id/mahnung-versenden` (Email-Worker übernimmt) statt direktem `EmailVersandDialog`-Submit.
- **`src/lib/api/types.ts`**: neue Types `MahnLauf`, `MahnLaufEintrag`, erweiterte `MahnEinstellungen`.
- **`src/hooks/useApi.ts`**: `useMahnStatus`, `useMahnLaeufe`, `useMahnJetztPruefen`, `useMahnungVersenden`.
- **`src/hooks/useLiveEvents.ts`**: SSE `mahnung:lauf-fertig`, `mahnung:vorschlag` → Query-Invalidations + Toast.

---

## Teil C — Steuern-Store ans Backend

### Migration `015_steuern_store.sql`

```sql
CREATE TABLE steuer_termine (
  id TEXT PRIMARY KEY,
  art TEXT NOT NULL,                -- 'umsatzsteuer'|'koerperschaftsteuer'|'gewerbesteuer'|'sonstige'
  zeitraum TEXT NOT NULL,           -- 'YYYY-MM' oder 'YYYY-Qn' oder 'YYYY'
  faellig_am TEXT NOT NULL,
  betrag_eur REAL,
  bezahlt_am TEXT,
  notiz TEXT,
  bezeichnung TEXT,                 -- für 'sonstige' (Mietsteuer, Lohnsteuer manuell etc.)
  erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
  geaendert_am TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_steuer_termine_faellig ON steuer_termine(faellig_am) WHERE bezahlt_am IS NULL;

CREATE TABLE steuer_ruecklagen (
  id TEXT PRIMARY KEY,
  monat TEXT NOT NULL UNIQUE,       -- 'YYYY-MM'
  gewinn_eur REAL NOT NULL,
  zurueckgelegt_eur REAL NOT NULL,
  notiz TEXT,
  erstellt_am TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Settings-Key `steuern.config` (Hebesatz, Standard-Rücklage-%, Disclaimer-Bestätigt, Firmenstammsitz) bekommt eine Default-Initialisierung beim ersten Start (Sankt Augustin GmbH-Werte aus dem Memory).

### Backend — `backend/src/steuern/`

`repo.ts`, `mappers.ts`, `validation.ts` (Skelett existiert) werden ausgebaut um:
- Termine-CRUD
- Rücklagen-CRUD
- Berechnungs-Endpoint `POST /steuern/berechne` (1:1-Port von `src/lib/steuern/berechnung.ts`) — lokale Frontend-Datei bleibt für Live-Vorschau, Backend liefert die kanonische Berechnung.

### Routen — `backend/src/routes/steuern.ts`

| Method | Pfad | Zweck |
|---|---|---|
| GET | `/steuern/termine?jahr=` | Liste |
| POST | `/steuern/termine` | neuen Termin |
| PATCH | `/steuern/termine/:id` | bezahlt-Marker, Notiz |
| DELETE | `/steuern/termine/:id` | löschen |
| GET | `/steuern/ruecklagen?von=&bis=` | Liste |
| POST | `/steuern/ruecklagen` | upsert per Monat |
| POST | `/steuern/berechne` | Schätzung für gegebenen Gewinn |
| POST | `/steuern/termine/auto-anlegen` | erzeugt USt-Voranmeldungen für Folgejahr (Idempotent) |

### Fristen-Cron Erweiterung

Existierender Dokument-Fristen-Cron prüft zusätzlich `steuer_termine.faellig_am` und erzeugt die gleichen „heute / 7 Tage / überfällig"-Benachrichtigungen.

### Frontend

- **`src/lib/steuern/store.ts`**: localStorage-Pfade entfernt, alle Funktionen zu Hooks (`useSteuerTermine`, `useSteuerRuecklagen`, `useSteuerConfig`).
- **One-Time-Migration** beim ersten Mount der `/steuern`-Route: liest verbleibende localStorage-Daten und postet sie in die neuen Endpoints, setzt Marker `mcc_steuern_migrated_v2`.
- **`src/routes/steuern.tsx`** + Komponenten in `src/components/steuern/*` rufen die neuen Hooks.
- **`src/lib/steuern/berechnung.ts`**: bleibt für Live-Vorschau; bei „Speichern" wird Backend-Endpoint genutzt.

---

## Teil D — Tests

- `backend/test/mahn-automatik.spec.ts` — Modus aus/vorschlag/auto, Werktagsfilter, Pause-Erkennung, Inkasso-Schwelle, Lauf-Idempotenz (zweiter Cron im selben Slot tut nichts).
- `backend/test/mahn-routen.spec.ts` — Auth-Pflicht, Versand-Endpoint erzeugt Mahnungs-Eintrag + Email-Versand transaktional, Settings-Reload re-registriert Cron.
- `backend/test/steuern-termine.spec.ts` — CRUD, Filter, Auto-Anlegen Idempotenz, Fristen-Cron-Trigger.
- `backend/test/steuern-berechnung.spec.ts` — fixe Eingaben → erwartete USt/KSt/Soli/GewSt-Werte (Sankt-Augustin-Hebesatz 525 %, GmbH-Effektivsatz 34,2 %).

Ziel: alle 4 grün, Gesamtzahl Backend-Tests ≥ 110.

---

## Was bewusst NICHT in diesem Step ist

- Lohnsteuer-Voranmeldung — Mitarbeiter-Modul ist out-of-scope MVP.
- Mehrjahres-Steuerbescheid-Import (PDF-Parsing) — separater Step.
- Mahnung Stufe 4 / Inkasso-Übergabe-Brief-Generator — bleibt manuell.

---

## Geänderte / neue Dateien (Übersicht)

**Neu:**
- `backend/src/db/migrations/014_mahn_automatik.sql`, `015_steuern_store.sql`
- `backend/src/mahnung/{regeln,repo,automatik,cron}.ts`
- `backend/src/routes/mahnung.ts`
- `backend/src/steuern/{termine-repo,ruecklagen-repo,berechnung,cron-erweiterung}.ts`
- `backend/test/mahn-automatik.spec.ts`, `mahn-routen.spec.ts`, `steuern-termine.spec.ts`, `steuern-berechnung.spec.ts`
- `mem/features/mahn-automatik.md`, `mem/features/steuern-backend.md`

**Editiert:**
- `backend/src/server.ts` (Mahn-Cron + erweiterter Steuer-Termine-Cron)
- `backend/src/routes/{steuern,einstellungen,belege}.ts` (Versand-Endpoint, Settings-Hot-Reload)
- `backend/src/dokumente/fristen-cron.ts` (auch Steuertermine prüfen)
- `src/lib/api/types.ts`, `src/hooks/useApi.ts`, `src/hooks/useLiveEvents.ts`
- `src/lib/mahnung/regeln.ts` (Anzeige-only)
- `src/lib/steuern/{store,berechnung}.ts` (Hooks statt localStorage)
- `src/components/mahnung/{MahnwesenTab,MahnSektion}.tsx`
- `src/components/dashboard/NaechsteSchritteCard.tsx`
- `src/components/steuern/*` (auf Hooks umgestellt)
- `src/routes/steuern.tsx`
- `mem/index.md`

**Sag „weiter", dann setze ich Step 13 um.**
