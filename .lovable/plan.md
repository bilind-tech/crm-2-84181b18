
# Vollständige Einstellungen-Seite

Alle Tabs in `/einstellungen` bekommen vollwertige Frontend-UIs — Lade/Speichern/Validierung — mit Mock-Backend-Persistenz, damit später nur die echten Pi-Endpoints angeschlossen werden müssen. Schwerpunkt: **SMTP** (Passwort verschlüsselt, nach Speichern nicht mehr sichtbar) und **Google Drive** (kompletter Connect-Flow mit allen für die spätere Pi-Integration nötigen Feldern).

## Tab-Übersicht & geplanter Inhalt

### 1. Firmendaten ✅ bereits vorhanden — nur Politur
- `Logo`-Upload-Feld ergänzen (Drop-Zone, Vorschau, Base64 in Mock).
- Pflichtfeld-Validierung mit Zod, Inline-Fehler.

### 2. E-Mail-Vorlagen ✅ vollständig vorhanden — keine Änderung.
### 3. E-Mail-Signaturen ✅ vollständig vorhanden — keine Änderung.

### 4. SMTP-Server ✅ Logik vorhanden — Härtung
- Passwort-Feld:
  - Wenn `passwortGesetzt = true`: Feld leer + Placeholder `••••••••`, `autoComplete="new-password"`, leeres Senden = Passwort behalten.
  - Server-Antwort enthält **nie** das Passwort (Typ erzwingt das schon).
  - Hinweisbox: „AES-GCM verschlüsselt im Pi gespeichert, nicht mehr lesbar".
- Sichtbarer Status: grüner Punkt + „Passwort hinterlegt" wenn `passwortGesetzt`, sonst gelber Punkt + „Noch kein Passwort".
- Test-Verbindung-Button (existiert) + Anzeige der letzten Test-Antwort (Erfolg/Datum).
- Vorbelegte Strato-Defaults via „Strato"-Schnellauswahl-Button (Server `smtp.strato.de`, Port `465`, SSL on).

### 5. Erscheinungsbild — NEU
- Theme-Wahl: System / Hell / Dunkel (Cards mit Vorschau-Mini).
- Akzentfarbe: 8 vordefinierte Swatches + Custom-HEX-Input mit Live-Vorschau-Knopf.
- Speichern via existierendem `useUpdateAppearance`. Theme wird sofort über bestehenden `ThemeProvider` angewendet.

### 6. Nummernkreise — NEU
- Drei Felder: Kunde-Präfix, Angebot-Präfix, Rechnung-Präfix.
- Live-Vorschau jedes Schemas (`{YYYY}` → 2026, `{####}` → 0042) unterhalb jedes Inputs.
- Validierung: Pflicht-Platzhalter `{####}` muss vorkommen.
- Verknüpft mit existierendem `useNummernkreise` / `useUpdateNummernkreise`.

### 7. Mahnwesen ✅ bereits vorhanden — keine Änderung.

### 8. Daueraufträge ✅ bereits vorhanden — keine Änderung.

### 9. Textbausteine & Vorlagen — NEU
Zwei Sektionen in einem Tab:
- **Positionsvorlagen** (Reinigung, Stundensatz etc.): Liste + „Neu"-Dialog mit Bezeichnung, Beschreibung, Einheit, Preis, MwSt. CRUD via existierende Hooks `usePositionsvorlagen` / `useCreate*` / `useDelete*`.
- **Textvorlagen**: Liste gruppiert nach Zweck (Angebot Intro/Outro, Rechnung Intro/Outro, E-Mail Angebot/Rechnung). Inline-Edit. CRUD via existierende `useTextvorlagen`-Hooks.

### 10. Google Drive — NEU (Schwerpunkt)
**Datenmodell (neu in `types.ts`):**
```ts
interface GoogleDriveEinstellungen {
  verbunden: boolean;
  kontoEmail?: string;             // z.B. "buero@mycleancenter.cm"
  verbundenAm?: ISODateTime;
  rootOrdnerName: string;          // default "mycleancenter.cm"
  rootOrdnerId?: string;           // wird vom Pi nach Verbindung gesetzt
  unterordnerSchema: {
    rechnungen: string;            // default "Rechnungen/{YYYY}/{MM}"
    angebote: string;              // default "Angebote/{YYYY}/{MM}"
  };
  dateinameSchema: {
    rechnung: string;              // default "{nummer} {kunde} {leistung} {MM}-{YYYY}"
    angebot: string;               // default "{nummer} {kunde} {leistung} {MM}-{YYYY}"
  };
  autoUpload: boolean;             // default true
  letzteSynchronisation?: ISODateTime;
  letzterFehler?: string;
}
```

**UI-Aufbau:**
- **Verbindungs-Karte** oben:
  - Nicht verbunden → großer Button „Mit Google verbinden" (öffnet Mock-Dialog, simuliert OAuth-Erfolg, setzt `kontoEmail` + `verbundenAm`).
  - Verbunden → grüner Status-Badge, verbundenes Konto, „Verbindung trennen"-Button (mit Bestätigung), letzte Synchronisation, ggf. roter Banner mit `letzterFehler`.
- **Ordnerstruktur**:
  - Root-Ordner-Name (default `mycleancenter.cm`, einmalig setzbar nach Verbindung).
  - Unterordner-Schema für Rechnungen/Angebote mit Live-Vorschau-Pfad (z. B. `mycleancenter.cm/Rechnungen/2026/05/`).
- **Dateinamen-Schema** mit Platzhalter-Chips (`{nummer}` `{kunde}` `{leistung}` `{MM}` `{YYYY}` `{datum}`) + Live-Vorschau eines Beispiel-Dateinamens.
- **Auto-Upload-Toggle** (default an): „Beim Erstellen automatisch hochladen — fehlerfrei und ohne User-Klick."
- **Test-Upload-Button**: lädt eine Test-PDF hoch und zeigt Drive-Link.

**Backend (Mock):** neuer Endpoint `/einstellungen/google-drive` (GET/PATCH), `POST /einstellungen/google-drive/connect` (Mock setzt `verbunden=true`), `POST /einstellungen/google-drive/disconnect`, `POST /einstellungen/google-drive/test`.

### 11. Backup & Download — NEU
- **Auto-Backup-Toggle** + Zeitpunkt (Time-Picker, default `02:00`) + Aufbewahrung (Anzahl, default 7) + Zielordner (Pfad-Input, default `/mnt/ssd/backups`).
- **Manuelle Backups**: Liste der letzten Backups (Datum, Größe, Status) — Button „Jetzt sichern" (`useCreateBackup`) + Download-Button pro Eintrag.
- **Daten-Export**: Buttons „CRM-Daten als JSON exportieren", „Kunden als CSV", „Rechnungen als CSV".

### 12. Sicherheit — NEU
- **Auto-Lock**: Slider 1–60 Minuten („Nach X Minuten Inaktivität sperren"). Verknüpft mit existierendem `useSicherheit` / `useUpdateSicherheit`.
- **Geräte/Sitzungen**: Liste aktueller LAN-Geräte (Mock-Liste mit Hostname + letzter Aktivität) — Button „Alle abmelden". (Nur UI; Pi-Backend liefert später echte Daten.)

### 13. Verlauf — NEU
- Auflistung aus `useAktivitaeten()` mit Filter (alle / Einstellungs-Änderungen / Backups / System).
- Spalten: Zeitpunkt, Typ-Badge, Beschreibung, optional Link zur Entität.
- Pagination 50 pro Seite.

## Layout / Navigation

Auf dem Smartphone wird die heutige horizontale Tab-Leiste schnell unübersichtlich. Lösung:
- **Desktop (≥md)**: linke Sub-Sidebar mit Tab-Liste, rechts Inhaltsbereich. Maximalbreite 5xl.
- **Mobil**: oberhalb des Inhalts ein `Select`-Dropdown mit dem aktuellen Tab. Tippen öffnet die Liste mit Icons.
- Sticky-Save-Bar bleibt unten am Viewport (nutzt bereits eingeführtes Muster). Pro Tab: links „Zurücksetzen" (deaktiviert wenn `!dirty`), rechts „Speichern".

## Validierung & UX-Standards

- **Zod** für jedes Formular (Pflichtfelder, E-Mail-Format, Port-Bereich, HEX-Farbe, Pfad).
- **Toast** bei Erfolg + Fehler (sonner ist eingerichtet).
- **Optimistic Updates** wo unkritisch (Theme), sonst auf Server-Antwort warten.
- **`ConfirmDialog`** für destruktive Aktionen (Drive trennen, Backup löschen, Vorlage löschen).
- **Keine Sparkles/Glitzer-Icons**, keine Gradient-Hintergründe in Dialogen — bestehende Designregel halten.

## Technische Schritte (Reihenfolge)

1. **Typen** (`src/lib/api/types.ts`): `GoogleDriveEinstellungen` ergänzen. `SmtpEinstellungen.passwortGesetzt` bleibt — Antwort niemals Klartext.
2. **Hooks** (`src/hooks/useApi.ts`): `useGoogleDrive`, `useUpdateGoogleDrive`, `useConnectGoogleDrive`, `useDisconnectGoogleDrive`, `useTestGoogleDrive` ergänzen. Alle anderen Hooks existieren bereits.
3. **Mock-Backend** (`src/lib/mock/backend.ts` + `seed.ts`): Endpoints für Google Drive ergänzen. Sicherstellen, dass `/einstellungen/smtp`-PATCH das Passwort entgegennimmt und `passwortGesetzt=true` setzt, aber nie zurückgibt.
4. **Neue Tab-Komponenten** in `src/components/einstellungen/`:
   - `ErscheinungsbildTab.tsx`
   - `NummernkreiseTab.tsx`
   - `VorlagenTab.tsx` (Positions- + Textvorlagen)
   - `GoogleDriveTab.tsx`
   - `BackupTab.tsx`
   - `SicherheitTab.tsx`
   - `VerlaufTab.tsx`
5. **`einstellungen.tsx`** umbauen: Sidebar/Select-Navigation, Tab-Routing, alle neuen Komponenten einbinden, Platzhalter-Block entfernen.
6. **Logo-Upload** im FirmendatenTab als Drop-Zone (Base64 im Mock).
7. **Testen**: jeden Tab durchklicken, Speichern, Reload → Werte bleiben.

## Was bewusst NICHT Teil ist

- Echte Google-OAuth-Integration (kommt erst auf dem Pi — Mock simuliert nur den Connect-Flow).
- Echte SMTP-Verschlüsselung (Mock speichert kein Klartext-Passwort, der echte AES-GCM-Schritt erfolgt im Pi-Backend).
- Echtes Backup-File-Handling (Mock liefert Dummy-Liste, Pi-Backend ersetzt das später).
- E-Mail-Sender-Domain-Setup (Strato-SMTP reicht — kein Lovable Email).
