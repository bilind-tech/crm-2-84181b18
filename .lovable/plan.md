## Phase A — Fortschrittsbalken + Teilzahlung (nur Frontend)

Wir bauen den visuellen Lebenszyklus jetzt fertig — alle Aktionen sind klickbar und ändern den Status lokal (über die bestehenden Mock-Hooks). Backend bleibt unangetastet. Das Gesamtkonzept wird zusätzlich im Memory gespeichert, damit wir später in den Backend-Phasen lückenlos weiterbauen können.

---

### 1) Neue Komponente: `src/components/flow/FlowBar.tsx`

Generischer, wiederverwendbarer Fortschrittsbalken. Eine Komponente — drei Größen.

**Props:**
- `steps: { key: string; label: string; date?: string; tone?: "neutral"|"success"|"danger" }[]`
- `currentIndex: number` (welcher Schritt ist „aktiv/erreicht")
- `size: "lg" | "sm" | "mini"`
  - `lg` → Detailseite: große Punkte, Labels, Datumsangabe darunter, dünne Verbindungslinie
  - `sm` → Kunden-Detail-Tabellen-Zeilen: kompakter Balken in einer Spalte
  - `mini` → 3–4 farbige Punkte `●●●○` für Listenansichten
- `onStepClick?: (key) => void` — optional, für klickbare Punkte

Visuell: schlicht, keine Gradients, keine Sparkles. Aktive Schritte = `bg-primary`, erledigte = `bg-success`, abgelehnt = `bg-destructive`, ausstehend = `bg-muted`. Verbindungslinie zwischen Punkten.

---

### 2) Flow-Definitionen: `src/lib/flow/flows.ts`

Reine Datei mit zwei Funktionen, die aus einem `Angebot` / `Rechnung` die Steps + den aktuellen Index berechnen:

**`angebotFlow(a: Angebot)` → 4 Schritte:**
```
Entwurf → Versendet → Antwort (Angenommen/Abgelehnt) → In Rechnung umgewandelt
```
- "Antwort" zeigt grün (✓ Angenommen), rot (✗ Abgelehnt) oder neutral („Wartet auf Antwort")
- Wenn Status `abgelehnt` → Schritt 4 wird grau/inaktiv, Balken endet
- Wenn `angenommen` aber noch keine Folge-Rechnung → Schritt 4 = nächster CTA

**`rechnungFlow(r: Rechnung)` → 4 Schritte:**
```
Entwurf → Versendet → Teilbezahlt (optional) → Bezahlt
```
- Wenn `zahlungen.length > 0` und offen > 0 → Schritt 3 aktiv, zeigt `X € von Y €`
- `überfällig` = roter Akzent auf Schritt 2/3, ohne den Flow umzubauen

---

### 3) Großer Flow-Balken auf Detailseiten

**`src/routes/angebote.$id.tsx`:** Direkt unter `PageHeader` ein `FlowBar size="lg"` mit dem Angebot-Flow. Ergänzend rechts daneben (oder darunter, mobil) ein **prominenter Primary-Action-Button** für den jeweils nächsten logischen Schritt:
- Status `entwurf` → „Per E-Mail versenden" (nutzt bestehende `useSendeAngebot`)
- Status `versendet` → zwei Buttons nebeneinander: „Angenommen" (grün) / „Abgelehnt" (outline, dezent)
- Status `angenommen` → „In Rechnung umwandeln" (bestehender Handler)
- Status `abgelehnt`/`abgelaufen` → kein CTA, nur Hinweis

**`src/routes/rechnungen.$id.tsx`:** `FlowBar size="lg"` mit Rechnung-Flow. Primary-Action:
- `entwurf` → „Versenden"
- `versendet`/`teilbezahlt` → **„Zahlung erfassen"** öffnet einen Dialog (siehe Punkt 5)
- `bezahlt` → grünes Badge „Vollständig bezahlt am {Datum}"

Status-Übergänge `angenommen`/`abgelehnt` für Angebote benötigen einen neuen Hook `useSetAngebotStatus(id)`, der intern `updateAngebot` aus `src/lib/api/client.ts` aufruft (Mock-Backend kann das schon).

---

### 4) Flow auf Kunden-Detailseite

**`src/routes/kunden.$id.tsx`:**

a) **Tab „Angebote"-Tabelle:** Neue Spalte „Status" → ersetzt das aktuelle Text-Status-Feld durch `FlowBar size="sm"`. Jede Zeile zeigt auf einen Blick, wo das Angebot steht.

b) **Tab „Rechnungen"-Tabelle:** Genau dasselbe — `FlowBar size="sm"` statt Plain-Text-Status. Zusätzlich rechts pro Zeile ein kleiner Text „150 € offen" wenn teilbezahlt.

c) **Tab „Übersicht":** Neue `SectionCard` „Aktuelle Vorgänge" mit den 3 zuletzt geänderten offenen Belegen (Angebot oder Rechnung), jeweils mit `FlowBar size="mini"`.

---

### 5) Teilzahlungs-Dialog — mobil-tauglich

**`src/components/forms/ZahlungErfassenDialog.tsx`** — neue Komponente.

Öffnet sich beim Klick auf „Zahlung erfassen" (oder den alten „Bezahlt markieren"-Button). Zeigt:

- **Großer Hinweis oben:** „Offen: **150,00 €** von 350,00 €"
- **Eingabefeld „Betrag":** vorausgefüllt mit dem offenen Betrag, große Touch-Targets, `inputMode="decimal"` für mobile Tastatur mit Komma
- **Schnell-Buttons:** [Voll bezahlen] [Hälfte] [Eigener Betrag] — einmal tippen statt tippen+rechnen
- **Datum:** heute, änderbar
- **Methode:** Dropdown (Überweisung, Bar, Karte, PayPal, SEPA, Sonstiges)
- **Optional:** Notiz
- Buttons unten: [Abbrechen] [Zahlung speichern]

Verwendet `useAddZahlung` (existiert bereits). Der Status wird vom Mock-Backend automatisch auf `teilbezahlt` oder `bezahlt` gesetzt — das passt schon.

In `src/routes/rechnungen.$id.tsx` ersetzt dieser Dialog den derzeitigen direkten „Bezahlt markieren"-Click. Die alte „Komplett-bezahlt-Logik" bleibt als ein Klick im Dialog erhalten.

---

### 6) Memory — Konzept festhalten für die Backend-Phasen

Damit wir später strukturiert Step-by-Step das Backend bauen, lege ich an:

- **`mem://features/document-lifecycle.md`** — Die kompletten Flows (Angebot/Rechnung), alle Statusübergänge, automatische vs. manuelle Übergänge, was später vom Backend kommen muss (z.B. „Status `überfällig` automatisch via Cron wenn Fälligkeitsdatum überschritten"), Verknüpfungen Angebot↔Rechnung.
- **`mem://features/payments.md`** — Teilzahlungen sind Kernfeature; mehrere `Zahlung`-Einträge pro Rechnung; Status leitet sich aus Summe ab; Eingabe muss mobil schnell gehen (Schnell-Buttons).
- **`mem://index.md` aktualisieren** — Verweise auf beide neuen Memories, plus Core-Hinweis: „Status-Lifecycle visuell via FlowBar auf Angebot-/Rechnung-/Kunden-Detailseiten und in Listen."

---

### Was NICHT Teil dieser Phase ist (kommt später)

- Monatsansicht im Dashboard (Phase E)
- Mini-Flow in Angebote-/Rechnungen-Listen außerhalb der Kunden-Detailseite (Phase F)
- E-Mail-Versand-Logik selbst (kommt mit dem Backend)
- Automatischer Übergang `versendet → überfällig` per Cron (Backend)

---

### Technische Details (für mich, später)

- Neue Dateien: `src/components/flow/FlowBar.tsx`, `src/lib/flow/flows.ts`, `src/components/forms/ZahlungErfassenDialog.tsx`
- Neuer Hook in `src/hooks/useApi.ts`: `useSetAngebotStatus(id)` — wraps `updateAngebot({ status })`
- Geänderte Routen: `src/routes/angebote.$id.tsx`, `src/routes/rechnungen.$id.tsx`, `src/routes/kunden.$id.tsx`
- Memory: `mem://features/document-lifecycle.md`, `mem://features/payments.md`, `mem://index.md`

---

Sag „los" und ich baue Phase A komplett.
