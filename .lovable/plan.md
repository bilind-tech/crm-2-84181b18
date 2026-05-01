## Phase B — E-Mail-Versand (Frontend-Only, Pi-Backend folgt später)

Ziel: Vollständiger E-Mail-Workflow im UI mit Vorschau, Vorlagen, Signaturen, Teilzahlung der Empfänger-Liste, PDF-Anhang, Status-Anzeige, Versand-Historie. Kein echter SMTP-Versand jetzt — der wird später im Pi-Backend (nodemailer + Strato) ergänzt. Im Frontend simulieren wir den Versand mit dem Mock-Backend, damit alle UI-Zustände (Spinner, Erfolg, Fehler) sichtbar sind.

---

### 1. Datenmodell (im Mock-Backend / `src/lib/api/types.ts`)

**EmailVorlage**
- `id`, `name` (z. B. „Angebot Standard")
- `betreff` (mit `{{platzhalter}}`)
- `koerperHtml` (HTML, vom User gepflegt)
- `koerperText` (automatisch aus HTML abgeleitet als Plain-Text-Fallback)
- `kontext`: `"angebot" | "rechnung" | "mahnung" | "allgemein"`
- `istStandard` (boolean — pro Kontext genau eine)
- `erstelltAm`, `aktualisiertAm`

**EmailSignatur**
- `id`, `name` (z. B. „Geschäftsführung", „Buchhaltung")
- `html` (HTML mit eingebettetem `<img>` für Logo/Bild — Bild später als Base64/CID, jetzt als Platzhalter-URL)
- `istStandard` (boolean)

**EmailVersand** (Historie)
- `id`, `belegId` (Angebot/Rechnung), `belegTyp`
- `empfaenger[]`, `cc[]`, `bcc[]`
- `betreff`, `koerperHtml`
- `vorlageId`, `signaturId`
- `anhaenge[]` (`{ name, sizeBytes }`)
- `status`: `"queued" | "sending" | "sent" | "failed"`
- `versendetAm`, `fehlerGrund`
- `messageId` (später vom SMTP)

**SmtpEinstellung** (verschlüsselt im Pi gespeichert — Frontend zeigt nur „verbunden / nicht verbunden")
- Felder: `host`, `port`, `username`, `passwortGesetzt: boolean` (NIE das Passwort zurückliefern), `absenderName`, `absenderEmail`, `tls`

---

### 2. Platzhalter-System (`src/lib/email/placeholders.ts`)

Reine Frontend-Funktion `replacePlaceholders(text, context)`:
- `{{kunde.firmenname}}`, `{{kunde.vorname}}`, `{{kunde.nachname}}`, `{{kunde.anrede}}`
- `{{angebot.nummer}}`, `{{angebot.datum}}`, `{{angebot.gueltigBis}}`, `{{angebot.summe}}`
- `{{rechnung.nummer}}`, `{{rechnung.datum}}`, `{{rechnung.faellig}}`, `{{rechnung.summe}}`, `{{rechnung.offen}}`
- `{{firma.name}}`, `{{firma.telefon}}`

Wird sowohl im Betreff als auch im HTML-Body ausgeführt, BEVOR der Vorschau-Dialog rendert. Unbekannte Platzhalter werden rot/gelb markiert (UI-Hinweis).

---

### 3. UI-Komponenten

**`src/components/email/EmailVersandDialog.tsx`** (Hauptdialog — modal, mittig, schlicht `bg-background`, KEIN Gradient, KEIN Sparkle-Icon)

Aufbau:
- **Empfänger-Block**: An / CC / BCC als Chip-Inputs. Vorausgefüllt mit Kunden-E-Mail aus Beleg, frei änder-/erweiterbar.
- **Vorlagen-Dropdown**: Lädt passende Vorlagen für den Beleg-Typ. Wechseln befüllt Betreff + Body neu (mit Bestätigung wenn schon editiert).
- **Signatur-Dropdown**: Wählt Signatur, wird unten an HTML angehängt.
- **Betreff-Feld** (einzeiliger Input mit Platzhalter-Highlight).
- **Body-Editor**: Tabs „Visuell" (rich-text via `react-simple-wysiwyg` oder `tiptap` minimal) + „HTML" (rohes Code-Edit mit `<textarea>` und Monospace-Font). Beide bleiben synchron.
- **Anhänge-Liste**: PDF des Belegs ist standardmäßig dran (mit Dateiname + Größe). „×"-Button zum Entfernen. „+ Datei anhängen" für später (Stub).
- **Vorschau-Bereich** (rechte Spalte oder Tab): Rendert finalen Body in einem `<iframe sandbox>` mit aufgelösten Platzhaltern und angehängter Signatur. Zeigt genau, was beim Empfänger ankommt.
- **Footer**: „Abbrechen" + Primary-Button „Jetzt senden".

**Versand-State-Machine** (im Dialog):
- `idle` → Button aktiv „Jetzt senden"
- `sending` → Button disabled, Spinner + Text „Wird versendet …"
- `sent` → grünes Banner „E-Mail erfolgreich versendet an [empfänger]" mit Häkchen, nach 2 s auto-close
- `failed` → rotes Banner mit `fehlerGrund`, Button wird zu „Erneut senden"

**`src/components/email/EmailVersandHistorie.tsx`**
- Tabelle/Liste auf Beleg-Detailseite: „Wann · An · Status (Chip) · Betreff · 👁 Vorschau"
- Klick auf Zeile öffnet Read-only-Vorschau mit dem damaligen Body
- Status-Chip: grün=sent, grau=queued, blau=sending, rot=failed
- Zählt in den `FlowBar` ein (Status „Versendet" wird aktiv, sobald ≥1 erfolgreicher Versand existiert)

---

### 4. Einstellungen-Seite — neue Abschnitte

In `src/routes/einstellungen.tsx` zwei neue Karten:

**E-Mail-Vorlagen**
- Liste aller Vorlagen, gruppiert nach Kontext
- „+ Neue Vorlage" → Dialog mit Name, Kontext-Auswahl, Betreff, HTML-Editor, „Als Standard für Kontext setzen"-Checkbox
- Bearbeiten / Duplizieren / Löschen pro Vorlage
- Live-Vorschau-Tab mit Beispieldaten

**E-Mail-Signaturen**
- Liste aller Signaturen
- Editor (HTML), Bild-Upload-Stub („Bild kommt später vom Pi"), Standard-Marker
- Vorschau-Rendering im sicheren iframe

**SMTP-Verbindung** (separate Karte)
- Status-Anzeige: grüner Punkt „Verbunden mit Strato (smtp.strato.de:465)" oder grauer „Nicht eingerichtet"
- Felder: Host, Port, Benutzername, Absender-Name, Absender-Adresse, TLS-Toggle
- Passwort-Feld: `<input type="password">`, Platzhalter „••••••••" wenn schon gesetzt. Wert wird beim Submit ans Backend geschickt und NIE wieder zurückgeladen. UI-Text: „Passwort wird verschlüsselt im Backend gespeichert und nicht angezeigt."
- Button „Verbindung testen" (jetzt Mock — später ruft Pi-Endpoint auf)

---

### 5. Integration in bestehende Detailseiten

**`src/routes/angebote.$id.tsx`**: Primary-Action-Button „Per E-Mail versenden" öffnet `EmailVersandDialog` mit Kontext „angebot", lädt Standard-Vorlage „Angebot Standard". Nach Erfolg: Status → `versendet`, Eintrag in `EmailVersandHistorie`.

**`src/routes/rechnungen.$id.tsx`**: Gleiches Muster, Kontext „rechnung". Bei überfälligen Rechnungen zusätzlicher Button „Mahnung senden" (Kontext „mahnung").

**Beide Seiten**: Unter dem `FlowBar` neue Sektion „E-Mail-Versand" mit `EmailVersandHistorie`.

---

### 6. Mock-Backend-Verhalten (`src/lib/mock/backend.ts`)

`sendEmail()` simuliert:
- 1.2 s Delay (Spinner sichtbar)
- 90 % Erfolg, 10 % Zufalls-Fehler („SMTP-Verbindung fehlgeschlagen", „Empfänger ungültig") — damit Fehler-UI testbar ist
- Speichert `EmailVersand`-Eintrag, aktualisiert Beleg-Status

Vorlagen + Signaturen + SMTP-Settings werden im Mock-Backend persistiert (in-memory Map mit localStorage-Spiegel), damit nichts verloren geht beim Reload.

---

### 7. Memory-Updates

Neuer Eintrag `mem://features/email-versand.md`:
- Versand-Workflow (Vorschau → Senden → Status)
- Datenmodell (Vorlagen, Signaturen, Historie, SMTP)
- Platzhalter-Syntax `{{...}}`
- HTML-Body + automatischer Plain-Text-Fallback
- PDF-Anhang automatisch, im Dialog entfernbar
- SMTP-Passwort: nur einmal eingebbar, verschlüsselt im Backend, NIE im UI lesbar
- Pi-Backend-TODO: nodemailer + Strato + AES-Verschlüsselung der SMTP-Credentials + DKIM/SPF-Doku

Index aktualisieren.

---

### 8. Aus dem Plan ausgeklammert (kommt später im Backend)

- Tatsächlicher SMTP-Versand via nodemailer
- AES-Verschlüsselung des SMTP-Passworts auf dem Pi
- Bounce-/Delivery-Tracking
- Datei-Upload für Signatur-Bilder (Base64 → CID-Embedding)
- Mahnungs-Eskalation (1./2./3. Mahnung mit Fristen)

---

### Reihenfolge der Umsetzung (in einem Rutsch)

1. Datentypen + Mock-Backend-Endpoints
2. Platzhalter-Engine
3. `EmailVersandDialog` mit allen Sub-Komponenten
4. `EmailVersandHistorie` + Integration in Beleg-Seiten
5. Einstellungen: Vorlagen + Signaturen + SMTP-Karten
6. Memory-Files + Index

Sag **„los, Phase B"** und ich baue alles. Wenn du noch was umstellen willst (z. B. Editor-Bibliothek, Reihenfolge, Mock-Fehlerquote), sag's jetzt.