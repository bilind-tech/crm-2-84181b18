# Project Memory

## Core
Backend läuft später lokal auf Raspberry Pi (Pi 5, 8GB RAM) mit USB-SSD. Stack: Node.js + Fastify + SQLite (better-sqlite3). Nicht in Cloud deployen.
**Git-Repo (PUBLIC):** https://github.com/bilind-tech/remix-of-crm.git — für Pi-Updates via git clone, kein Token nötig.
**Code/Daten strikt trennen:** Code in `/opt/mycleancenter/current/`, Daten in `/var/lib/mycleancenter/`. Updates ersetzen NUR Code, niemals Daten. Atomar via fs.rename, alter Code 1 Vorgänger-Ordner für Rollback.
**ABSOLUTE REGEL:** Bei System-Updates UND Backup/Restore darf NIEMALS etwas am Daten-Verzeichnis verändert/gelöscht/überschrieben werden außerhalb des kontrollierten Restore-Flows. Vor jedem Update UND vor jedem Restore wird automatisch ein Sicherheits-Backup erstellt.
**Single-User-System:** Genau ein Konto, kein Username-Feld, keine Rollen, keine Benutzerverwaltung. LockScreen = nur Passwort. Recovery-Code als einziger Wiederherstellungsweg. Backend: `requireAuth` überall, kein `requireOwner`, keine `/benutzer`-Route.
PDFs (Rechnungen + Angebote) werden automatisch nach Google Drive hochgeladen — fehlerfrei, ohne User-Klick. Status-Indikator klein/dezent in der UI.
Google Drive OAuth wird einmalig in Einstellungen → Google Drive verbunden, Token wird im Backend (Pi) verschlüsselt gespeichert. Gilt geräteübergreifend (Desktop, Handy, alle Browser im LAN sehen denselben verbundenen Status).
Drive-Ordnerstruktur: Root-Ordner `mycleancenter.cm` (einmalig erstellt) → `Rechnungen/{YYYY}/{MM}/` und `Angebote/{YYYY}/{MM}/`. Dateinamen enthalten Kundenname, Leistung, Monat, Jahr. Monat/Jahr werden live aus dem aktuellen Datum bestimmt (Monatswechsel automatisch).
SMTP über Strato (nodemailer). Backups: tägliches SQLite-Snapshot auf USB-SSD + optional Drive.
Backups erscheinen in Liste/Status NUR wenn `status==="erfolg"` UND `abgeschlossenAm!=null`. Sonst „in Arbeit"-Indikator.
Keine Sparkles/Glitzer-Deko-Icons. Keine Gradient-Hintergründe in Dialogen — schlichtes `bg-background`.
Status-Lifecycle visuell via `FlowBar` (lg/sm/mini) auf Angebot-/Rechnung-/Kunden-Detailseiten und in Listen. Nächster logischer Schritt immer als prominenter Primary-Action-Button.
Teilzahlungen sind Kernfeature: mehrere Zahlungen pro Rechnung, Status leitet sich aus Summe ab. Einstieg über Button „Als bezahlt markieren" → kleiner mittiger Mini-Dialog, Stufe 1 fragt Ja/Nein/Abbrechen, bei „Nein" Stufe 2 mit nur einem Betragsfeld. Datum/Methode/Notiz NICHT in UI — automatisch (heute, Überweisung, leer).
**Steuer-Modul:** GmbH Sankt Augustin. MVP nur 3 Hauptsteuern automatisch (USt 19/7%, KSt 15% + Soli 5,5%, GewSt Hebesatz 525% = effektiv 18,375%). Effektive GmbH-Gesamtbelastung 34,20% vom Gewinn. Empfohlene Rücklage 35%. Reine Reinigung/Wartung — keine §48 Bauleistungen. Restliche Steuerarten als manuelle Termine. Disclaimer „Schätzung — keine Steuerberatung".
**ABSOLUT NIEMALS automatischer E-Mail-Versand.** Mails nur durch direkten User-Klick (EmailVersandDialog, SMTP-Test). Mahn-Cron deaktiviert + Guard `quelle==="cron"` returnt sofort. Modus "auto" zwangsumgestuft auf "vorschlag". Kein Trigger/Hook/Statuswechsel darf je `enqueueVersand` aufrufen.

## Memories
- [Git Repo](mem://reference/git-repo) — PUBLIC GitHub-Repo URL für Pi-Updates
- [Niemals Auto-Mails](mem://constraints/no-auto-email) — Höchste Priorität, Mails nur per User-Klick
- [Single-User-Modus](mem://constraints/single-user) — Ein Konto, kein Username, keine Rollen
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
