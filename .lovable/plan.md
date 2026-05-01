## Ziel

E-Mail-Versand und Status-Sichtbarkeit bei Angeboten und Rechnungen verbessern, Dashboard intelligent machen ("nächster Schritt pro Kunde"), und den nicht-öffnenden Senden-Klick endgültig fixen.

## 1. Senden-Icon → Brief-Icon (Mail)

In `src/routes/angebote.tsx` und `src/routes/rechnungen.tsx`:
- Lucide-Import `Send` ersetzen durch `Mail` (im Listenkontext intuitiver, da identisch zur Mail-App-Konvention).
- Tooltip bleibt "Per E-Mail versenden".
- In den Detail-Headern (`angebote.$id.tsx`, `rechnungen.$id.tsx`) `Send` ebenfalls in den Senden-Buttons durch `Mail` ersetzen, damit die Bedeutung über alle Ansichten konsistent ist.

## 2. Senden-Klick öffnet endlich den Dialog

Die URL-Änderung ohne sichtbaren Dialog kommt daher, dass beim Klick auf das Senden-Icon der State `emailFuer` zwar gesetzt wird, der `<EmailVersandDialog>` aber synchron auf einen geladenen Kunden + fertiges PDF wartet — und parallel die Row-Navigation (Tabellen-/Karten-Klick) trotzdem läuft, weil das Event über das `<button>` hinaus zum nativen `<tr role="link">` durchschlägt (Reihenfolge der Handler bzw. fehlendes `preventDefault`).

Fix:
- Im Senden-Button immer `e.stopPropagation()` **und** `e.preventDefault()` aufrufen (Mobile-Card und Desktop-Tabelle, Angebote + Rechnungen).
- `AngebotEmailLauncher` / `RechnungEmailLauncher` so umbauen, dass sie den Dialog **sofort** öffnen — auch wenn das PDF noch lädt. Der Dialog erhält `pdfBlobUrl={null}` und zeigt statt Anhang ein dezentes "PDF wird vorbereitet…" mit Spinner; Senden-Knopf bleibt deaktiviert, bis das PDF fertig ist (`pdf.status === "ready"`).
- Damit verschwindet das Phänomen "Klick → URL ändert sich, aber nichts passiert" auch bei langsamer PDF-Generierung.

## 3. Rechnungen: E-Mail-Action vorhanden machen

Die Rechnungen-Liste hat den Email-Launcher bereits im Code, aber laut Nutzer fehlt der Button visuell. Wir stellen sicher, dass:
- Die Mobile-Card und die Desktop-Tabelle den Mail-Button konsistent zeigen (auch bei Status `entwurf` und `versendet`, ausgeblendet nur bei `storniert`).
- Der Button links vom Zahlung-Button platziert ist und `text-primary` als Hover-Farbe hat (gleiche Optik wie bei Angeboten).
- In der Rechnung-Detailseite (`rechnungen.$id.tsx`) wird der Senden-Button auch dann sichtbar (sekundär neben dem Primary-Action), wenn die Rechnung schon versendet/teilbezahlt ist — als "Erneut senden".

## 4. Status-Klärung im Listen-Eintrag

Aktuell zeigt der Status-Badge "Versendet" oder "Bezahlt", aber Bezahlt/Offen-Beträge sind klein/grau. Verbesserungen:

**Rechnungen-Liste:**
- In der Mobile-Card: Bei Status `bezahlt` einen grünen Mini-Hinweis "✓ bezahlt am {datum}" unterhalb des Betrags. Bei `teilbezahlt` "{bezahlt €} von {brutto €}". Bei `ueberfaellig` "überfällig seit {tage} Tagen" in Rot.
- In der Desktop-Tabelle: Spalte "Offen" bekommt für `bezahlt` einen grünen Check statt "0,00 €"; für `ueberfaellig` rote Schrift mit Tage-Suffix.

**Angebote-Liste:**
- Status-Badge bleibt, aber zusätzlich: Bei `versendet` ein subtiler Hinweis "wartet auf Antwort". Bei `angenommen` ein Hinweis "→ Rechnung erstellen" verlinkt direkt zur In-Rechnung-Umwandlung. Bei `abgelehnt` grau ausgegraut.

## 5. Annahme/Ablehnung in der Angebots-Liste

Bisher kann man Angenommen/Abgelehnt nur in der Detailseite setzen. Wir ergänzen:
- In der Mobile-Card und in der Desktop-Tabelle: Wenn Status `versendet`, erscheinen direkt zwei kleine Icon-Buttons (Daumen hoch grün / Daumen runter grau) neben dem Status-Badge. Klick = Status-Update via `useUpdateAngebot`, mit Toast-Bestätigung "Angebot {nummer} als angenommen markiert".
- Damit man nicht erst in die Detailseite muss, um diese geschäftskritische Info zu erfassen.

## 6. Dashboard: "Was muss ich als Nächstes tun?"

Neuer Abschnitt im Dashboard (`src/routes/index.tsx`) zwischen Umsatz-Chart und "Offene Rechnungen": **"Nächste Schritte"** als priorisierte Aktionsliste. Kombiniert Angebote, Rechnungen und Daueraufträge:

```text
┌───────────────────────────────────────────────────────────┐
│  Nächste Schritte                                         │
├───────────────────────────────────────────────────────────┤
│  ✉  Rechnung an „Müller GmbH" senden            [Senden] │
│     für angenommenes Angebot AN-2025-014                  │
│                                                            │
│  📄 Rechnung erstellen für „Schulze AG"     [Erstellen] │
│     Angebot AN-2025-012 wurde angenommen                  │
│                                                            │
│  ⏰ Mahnung Stufe 1 für „Bayer KG"             [Mahnen] │
│     RE-2025-007 ist 12 Tage überfällig                    │
└───────────────────────────────────────────────────────────┘
```

Logik der Einträge (sortiert nach Dringlichkeit):
1. **Rechnung erstellen** — Angebot mit Status `angenommen`, das noch keine Folge-Rechnung hat → CTA "In Rechnung umwandeln" (öffnet Detailseite oder ruft `useAngebotInRechnung` direkt).
2. **Rechnung versenden** — Rechnung mit Status `entwurf`, die aus einem angenommenen Angebot stammt → CTA "Per E-Mail senden" (öffnet `EmailVersandDialog` direkt vom Dashboard, mit vorbelegtem Kunden).
3. **Mahnung schicken** — Rechnung überfällig & Mahnstufe < 3 → CTA "Mahnen" (öffnet Mahn-Dialog mit Stufenvorschlag).
4. **Angebot nachfassen** — Angebot seit > 7 Tagen `versendet`, kein Status-Wechsel → CTA "Nachfassen".

Jeder Eintrag zeigt **immer den Firmennamen des Kunden** und die Belegnummer, damit der Nutzer sofort weiß, wem er was schickt. Maximal 5 Einträge sichtbar, "Alle anzeigen" Link zu einer dedizierten Aktivitätsseite (existiert bereits unter `/aktivitaet`).

Leerzustand: "Alles erledigt — keine offenen Aufgaben." mit grünem Check.

## 7. Detailseite Angebot: bessere Status-Sichtbarkeit

In `angebote.$id.tsx`:
- Beim Status `angenommen` ohne Folge-Rechnung wird der bereits existierende "In Rechnung umwandeln"-Button durch einen **deutlich hervorgehobenen** Banner ergänzt: "Dieses Angebot wurde angenommen. Du musst noch die Rechnung an {firma} senden." mit großem Primary-CTA.
- Beim Status `abgelehnt` ein grauer Hinweis "Angebot wurde abgelehnt am {datum}".

## Technische Stichpunkte

- Neue Datei `src/lib/dashboard/naechsteSchritte.ts` mit Funktion `berechneNaechsteSchritte(angebote, rechnungen, kunden, mahnEinstellungen)`, gibt `Array<{ id, typ, kunde, beleg, prioritaet, ctaLabel, ctaTarget }>` zurück. Reine Funktion, gut testbar.
- Neue Komponente `src/components/dashboard/NaechsteSchritteCard.tsx` rendert die Liste; klickt-CTAs öffnen entweder eine Route oder einen Dialog (Email/Mahnung) — Dialog-State lebt in der Karte.
- `EmailVersandDialog` wird Dashboard-fähig: akzeptiert `pdfBlobUrl=null` und zeigt einen "PDF wird vorbereitet…"-Hinweis, statt zu warten. Senden-Knopf disabled bis PDF fertig.
- `Mail`-Icon aus `lucide-react` ersetzt `Send` an allen Listenstellen; Detail-Header behalten `Send` für die "Erneut senden"-Aktion (subtile Differenzierung) — alternativ überall `Mail`, falls einheitlicher gewünscht.
- Alle Senden-Buttons in Listen erhalten `e.stopPropagation()` + `e.preventDefault()` und werden zu echten `<button type="button">`.
- Lazy: PDF-Hooks (`useAngebotPdf`, `useRechnungPdf`) werden im Launcher beim ersten Mount sofort gestartet, blockieren aber das Öffnen nicht mehr.

## Was sich der Nutzer am Ende anschaut

- Liste Angebote: Mail-Icon, klick → Dialog poppt sofort auf, PDF lädt im Hintergrund. Daumen-hoch/-runter direkt in der Zeile.
- Liste Rechnungen: Mail-Icon sichtbar, klick → Dialog poppt sofort auf. Status-Zeile sagt klar "bezahlt am …" / "offen … €" / "überfällig X Tage".
- Dashboard: Karte "Nächste Schritte" sagt namentlich, was für welchen Kunden ansteht, mit Ein-Klick-CTA.
- Detail Angebot: Wenn angenommen → großer Banner "Schick die Rechnung an {Firma}".
