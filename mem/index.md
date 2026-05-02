# Project Memory

## Core
Backend läuft später lokal auf Raspberry Pi (Pi 5, 8GB RAM) mit USB-SSD. Stack: Node.js + Fastify + SQLite (better-sqlite3 mit WAL-Mode). Nicht in Cloud deployen.
**Code/Daten strikt trennen:** Code in `/opt/mycleancenter/current/` (read-only zur Laufzeit), Daten in `/var/lib/mycleancenter/` (einziger Schreibort). Updates ersetzen NUR Code via atomarem Symlink-Switch, niemals Daten. Alter Code 1 Vorgänger-Ordner für Rollback. Jede Schreib-Operation MUSS via `path.join(process.env.DATA_DIR, ...)` laufen — keine hartkodierten Pfade.
**ABSOLUTE REGEL:** Bei System-Updates UND Backup/Restore darf NIEMALS etwas am Daten-Verzeichnis verändert/gelöscht/überschrieben werden außerhalb des kontrollierten Restore-Flows. Vor jedem Update UND vor jedem Restore wird automatisch ein Sicherheits-Backup erstellt.
**Credentials niemals in Lovable-Secrets / niemals im Code:** Strato SMTP, Google OAuth (Client ID/Secret/Refresh-Token), Stundenzettel-URL etc. werden vom User in der Einstellungen-UI eingegeben, mit AES-256-GCM (Master-Key aus `${DATA_DIR}/keys/master.key`, root:root 0600) verschlüsselt und in der `einstellungen`-Tabelle gespeichert. Master-Key wird beim ersten Backend-Start generiert und ist Teil der Daten (wird mitgebackupt — sonst sind Settings nach Restore unbrauchbar).
**SQLite-Pflichten:** WAL-Mode (`PRAGMA journal_mode=WAL`), `foreign_keys=ON`, Backups NUR via `db.backup()` API (SQLite Online Backup), niemals plain `cp`. Schema-Versionierung via `_migrations`-Tabelle, Migration-Runner läuft bei jedem Backend-Start UND nach Restore (alte Backups werden auf aktuelles Schema gehoben).
**Backup-Inhalt = TAR.GZ:** SQLite-DB (via `db.backup()`) + `uploads/` (Logo etc.) + `keys/master.key` + `backup-manifest.json` (Schema-Version, App-Version). Sonst kein vollständiger Restore möglich.
PDFs (Rechnungen + Angebote) werden automatisch nach Google Drive hochgeladen — fehlerfrei, ohne User-Klick. Status-Indikator klein/dezent in der UI.
Google Drive OAuth wird einmalig in Einstellungen → Google Drive verbunden, Token wird verschlüsselt in `einstellungen`-Tabelle gespeichert. Gilt geräteübergreifend.
Drive-Ordnerstruktur: Root-Ordner `mycleancenter.cm` (einmalig erstellt) → `Rechnungen/{YYYY}/{MM}/` und `Angebote/{YYYY}/{MM}/`. Dateinamen enthalten Kundenname, Leistung, Monat, Jahr. Monat/Jahr werden live aus dem aktuellen Datum bestimmt.
SMTP über Strato (nodemailer), Zugangsdaten aus verschlüsselter `einstellungen`-Tabelle. Backups: tägliches SQLite-Snapshot auf USB-SSD + optional Drive.
Backups erscheinen in Liste/Status NUR wenn `status==="erfolg"` UND `abgeschlossenAm!=null`. Sonst „in Arbeit"-Indikator.
**Backend-Arbeitsweise (verbindlich):** Pro Step erst detaillierter Plan im Chat → User genehmigt → erst dann Umsetzung. Module zu 100% fertig (inkl. Dashboard/Liste/Detail/Einstellungen synchron) bevor das nächste startet. Bei großen Steps darf in einem Prompt ohne Rückfragen durchgearbeitet werden. Reihenfolge in `mem://features/backend-roadmap`.
Keine Sparkles/Glitzer-Deko-Icons. Keine Gradient-Hintergründe in Dialogen — schlichtes `bg-background`.
Status-Lifecycle visuell via `FlowBar` (lg/sm/mini) auf Angebot-/Rechnung-/Kunden-Detailseiten und in Listen. Nächster logischer Schritt immer als prominenter Primary-Action-Button.
Teilzahlungen sind Kernfeature: mehrere Zahlungen pro Rechnung, Status leitet sich aus Summe ab. Einstieg über Button „Als bezahlt markieren" → kleiner mittiger Mini-Dialog, Stufe 1 fragt Ja/Nein/Abbrechen, bei „Nein" Stufe 2 mit nur einem Betragsfeld. Datum/Methode/Notiz NICHT in UI — automatisch (heute, Überweisung, leer).
**Steuer-Modul:** GmbH Sankt Augustin. MVP nur 3 Hauptsteuern automatisch (USt 19/7%, KSt 15% + Soli 5,5%, GewSt Hebesatz 525% = effektiv 18,375%). Effektive GmbH-Gesamtbelastung 34,20% vom Gewinn. Empfohlene Rücklage 35%. Reine Reinigung/Wartung — keine §48 Bauleistungen. Restliche Steuerarten als manuelle Termine. Disclaimer „Schätzung — keine Steuerberatung".

## Memories
- [Backend-Roadmap](mem://features/backend-roadmap) — 12 Steps (0–11), neue Reihenfolge mit Settings/Auth+Backup vorgezogen, Akzeptanzkriterien, ABSOLUTE Regeln, DB-Architektur, Backup-Inhalt
- [Backend Step 1 — Auth + Settings](mem://features/backend-step1-auth-settings) — argon2id, AES-GCM, HttpOnly-Cookie, /auth/* + /einstellungen/*, Setup-Token-Flow
- [Hardware Setup](mem://reference/hardware) — Pi 5 + USB-SSD, Pi-OS-Lite, Imager-Schritte
- [Google Drive Integration](mem://features/google-drive) — OAuth-Flow, Ordnerstruktur, Dateinamen, Status-UI
- [Keine Deko-Icons & Gradients](mem://design/no-decorative-icons) — Sparkles verboten, Dialoge ohne Gradient
- [Document Lifecycle](mem://features/document-lifecycle) — Angebot/Rechnung Statusfluss, manuelle vs. automatische Übergänge, Backend-TODOs
- [Teilzahlungen](mem://features/payments) — Datenmodell, Status-Ableitung, ZahlungErfassenDialog
- [Backup & Rotation](mem://features/backup-rotation) — Daily/Weekly/Monthly, Sichtbarkeitsregel, Restore-Flow
- [System-Update](mem://features/system-update) — ZIP-Upload, Validierung, Live-Steps, Rollback
- [Belegnummern](mem://features/belegnummern) — Format `{KÜRZEL}{MM}{YY}/{NN}` z. B. `GFU0526/01`, Zähler pro Kunde+Monat
- [PDF-Editor](mem://features/pdf-editor) — Eigene Route `/{angebote|rechnungen}/:id/bearbeiten`, links Live-Preview mit Click-to-Edit-Hotspots, rechts Tab-Editor, Autosave
- [Steuer-Modul](mem://features/steuern) — GmbH Sankt Augustin, Sätze, Hebesätze, Termine, Berechnungsformeln, MVP-Umfang
- [Kürzel-Eindeutigkeit](mem://features/kuerzel-eindeutigkeit) — Kunden-Kürzel systemweit unique, Backend 409 + Live-Check via /kunden/kuerzel-frei, Submit blockiert bei Konflikt
- [Stundenzettel-Iframe](mem://features/stundenzettel-iframe) — CSP/X-Frame-Options, LAN-aus-Cloud, Mixed-Content, Lösungen
