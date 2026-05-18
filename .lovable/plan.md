**Was du willst**
1. Das gesamte Mahn-System (Stufen 1–3, Mahngebühren, Mahnläufe, Mahnwesen-Tab, Mahn-Karte, Mahn-Pause, Mahn-Cron) komplett raus.
2. Stattdessen ein leichtes „Zahlungserinnerung"-Feature: Sobald eine Rechnung X Tage nach Fälligkeit unbezahlt ist, schlägt das System eine freundliche Erinnerungs-Mail vor. Vorschlag ist sichtbar im Dashboard oben rechts (gleiche Stelle wie heute das Überfällig-Popup) und in der Rechnungs-/Angebotsliste neben den Einträgen. Ein Klick öffnet den E-Mail-Dialog mit voll ausgefülltem Empfänger, Ansprechpartner, Betreff, Body, PDF-Anhang – du musst nur drüberschauen und „Senden" drücken.

**Wichtig (Regel aus Memory)**
Keine Automatik. Versand passiert ausschließlich durch deinen Klick – das System schlägt nur vor.

---

## Teil 1 – Mahn-System entfernen

**Frontend (löschen):**
- `src/components/mahnung/` (MahnwesenTab, MahnLaeufeListe, MahnLaufDetailDialog, MahnSektion)
- `src/hooks/useMahnZaehler.ts`
- `src/lib/mahnung/` (regeln.ts, defaults.ts)
- `src/components/notifications/UeberfaelligPopup.tsx` (wird durch ErinnerungsPopup ersetzt)
- `src/hooks/useUeberfaelligeRechnungen.ts` (wird durch useErinnerungsKandidaten ersetzt)

**Frontend (bereinigen):**
- `src/routes/__root.tsx`: `<UeberfaelligPopup />` → `<ErinnerungsPopup />`
- `src/routes/einstellungen.tsx`: Tab „Mahnwesen" entfernen; stattdessen kleine Sektion „Zahlungserinnerung" im Tab „E-Mail" mit einem Feld „Tage nach Fälligkeit, ab denen vorgeschlagen wird" (Default 14).
- `src/routes/index.tsx`: Mahnwesen-Karte raus, durch „Zahlungserinnerungen offen" ersetzen (zeigt Anzahl + Liste mit Erinnern-Buttons).
- `src/routes/rechnungen.$id.tsx`: `<MahnSektion>` raus; auf der Rechnung erscheint stattdessen oben ein dezenter Hinweisstreifen „Erinnerung empfohlen – seit X Tagen offen" mit Primary-Button „Erinnerung senden".
- `src/routes/rechnungen.tsx`: in der Liste pro erinnerungs­reifer Rechnung ein kleiner amberfarbener „Erinnern"-Button neben der E-Mail-Aktion.
- `src/components/email/EmailVersandDialog.tsx`: Props `mahnStufe`, Hook `useMahnEinstellungen`, Verzweigung `kontext === "mahnung"` entfernen. `kontext` reduziert auf `"angebot" | "rechnung" | "allgemein"`.
- `src/lib/api/types.ts`: `MahnStufe`, `MahnVorgang`, `MahnStufeConfig`, `MahnModus`, `MahnEinstellungen`, `MahnLauf*`, `MahnStatus` raus; `mahnungen?`, `mahnPausiertBis?` aus Rechnung; `"mahnung"` aus `EmailKontext`.
- `src/hooks/useApi.ts`, `useLiveEvents.ts`, `localPreviewData.ts`: alle Mahn-Hooks/Queries/Events raus.
- `src/lib/email/placeholders.ts`: Mahn-Platzhalter (`mahnung.tageUeberfaellig`, `mahnung.gebuehr`, `mahnung.neueFrist`, `mahnung.gesamtForderung`) raus, dafür `rechnung.tageUeberfaellig` und `rechnung.neueFrist` (= heute + 7) ergänzen.
- `src/lib/dashboard/naechsteSchritte.ts`: Mahn-Vorschläge entfernen, dafür Erinnerungs-Vorschläge.

**Backend (löschen):**
- `backend/src/mahnung/` (automatik.ts, cron.ts, regeln.ts, repo.ts, settings-adapter.ts)
- `backend/src/routes/mahnung.ts`

**Backend (bereinigen):**
- `server.ts`: `mahnungRoutes` und `startMahnScheduler` raus.
- `events/bus.ts`, `aktivitaet/wireup.ts`: Event `mahnung:erstellt` raus.
- `routes/belege.ts`: Endpoint `POST /rechnungen/:id/mahnung-pausieren` raus; Import `pausiereMahnung` raus.
- `routes/email.ts`: `KONTEXTE` ohne `"mahnung"`; `mahnStufe`-Behandlung raus.
- `email/templates.ts`: Default-Seeds `mahnung.stufe1/2/3` raus. `rechnung.erinnerung`-Seed bleibt und wird die einzige Erinnerungs-Vorlage.
- `belege/mappers.ts`, `rechnungen-repo.ts`, `belege/status.ts`: Lese/Schreib-Pfade für Mahn-Felder raus; gespeicherte Spalten bleiben unangetastet (DB-Daten nicht löschen, Migrations-Files bleiben).
- `settings/schemas.ts`: `mahn`-Schema raus, neues schmales `erinnerung`-Schema (`{ tageNachFaelligkeit: number, default 14 }`).
- `routes/einstellungen.ts`: Mahn-Endpoints raus, dafür Get/Put für `erinnerung`.

**DB:** Keine Schema-Änderungen, keine Daten gelöscht (ABSOLUTE REGEL). Mahn-Spalten bleiben einfach unbenutzt.

---

## Teil 2 – Zahlungserinnerung einbauen

**Logik**
Eine Rechnung ist „erinnerungsreif", wenn:
- Status ∉ {bezahlt, storniert, entwurf}
- offener Restbetrag > 0
- heute ≥ `faelligkeitsdatum + tageNachFaelligkeit` (Setting, Default 14)
- letzte gesendete E-Mail (Kontext `rechnung`) liegt mindestens 7 Tage zurück, ODER es wurde noch nie eine Erinnerung gesendet (verhindert Doppelvorschlag direkt nach Klick).

Backend liefert die Liste über die bestehenden Rechnungs-Endpoints; kein neuer Endpoint nötig. Die „letzte Erinnerung"-Info kommt aus `email_versand`-Tabelle pro Rechnung (bereits vorhanden, wird in `useApi` aggregiert).

**Neue/geänderte Komponenten**
- `src/hooks/useErinnerungsKandidaten.ts`: gibt `{ count, gesamtOffen, rechnungen: [{id, nummer, kundeId, kundeName, tageUeber, offen, letzteErinnerung?}] }` zurück.
- `src/components/notifications/ErinnerungsPopup.tsx`: gleiche Position oben rechts wie heute, freundlicheres Wording („X Zahlungserinnerungen empfohlen"), bernsteinfarben statt rot, pro Eintrag „Erinnern"-Button → öffnet `EmailVersandDialog` mit `kontext="rechnung"` und `vorbelegteVorlageId` der Vorlage mit `seedKey="rechnung.erinnerung"` (Standard) oder der vom User in Einstellungen gewählten Erinnerungs-Vorlage.
- Dashboard-Karte „Zahlungserinnerungen" (ersetzt Mahnwesen-Block): kleine Liste der bis-zu-3 dringendsten Kandidaten mit Inline-„Erinnern"-Action.
- Rechnungs-Listenzeile (`rechnungen.tsx`): wenn `erinnerungsReif`, kleiner amber-Pill „Erinnerung empfohlen" + Button „Erinnern" der den Dialog öffnet.
- Rechnungsdetail (`rechnungen.$id.tsx`): oben dezenter Streifen mit gleicher Info + Primary-Button „Erinnerung senden".

**Settings-UI**
In Einstellungen → E-Mail (am Ende, neue Sektion „Zahlungserinnerungen"):
- Slider/Input „Vorschlag ab Tagen nach Fälligkeit" (Default 14, Range 1–60)
- Hinweis „Erinnerungen werden nur vorgeschlagen – nie automatisch gesendet."

**E-Mail-Inhalt**
Vorlage `rechnung.erinnerung` wird zur Standard-Erinnerungs-Vorlage (bereits seedet und freundlich formuliert). Im Dialog ist alles vorbelegt:
- Empfänger: Ansprechpartner-Mail oder Kunden-Mail
- Betreff: „Freundliche Erinnerung zu Rechnung {{rechnung.nummer}}"
- Body: bereits enthält Rechnungsnummer, Datum, Betrag, offen, Bankdaten, freundlicher Ton
- PDF: aktuelle Rechnung wird wie heute angehängt
- Anrede + Signatur: automatisch via vorhandene Platzhalter und User-Signatur

---

## Akzeptanz

- Kein Text mehr enthält „Mahnung", „Mahnstufe", „Inkasso", „Mahngebühr" in Code-UI (Dateinamen, Komponenten, Routen, Settings, Vorlagen).
- Backend startet ohne Mahn-Module; `mahnungRoutes` und `startMahnScheduler` existieren nicht mehr. Tests `mahn-step13b.spec.ts` werden gelöscht.
- Beim App-Start zeigt das Popup oben rechts nur dann etwas, wenn ≥1 Rechnung erinnerungsreif ist (Default: 14+ Tage über fällig, offen, nicht bezahlt).
- Klick auf „Erinnern" öffnet den E-Mail-Dialog vollständig ausgefüllt mit `rechnung.erinnerung`-Vorlage; einmal prüfen → senden.
- Setting „Tage nach Fälligkeit" wirkt sofort (Cache-Invalidate).
- Bestehende Rechnungs-, Angebots-, Drive-, Backup-Flows unverändert. Keine Auto-Mails (Memory-Regel bleibt eingehalten).

---

## Hinweise (technisch, falls relevant)

- Im EmailVersandDialog ist `vorbelegteVorlageId` bereits Prop – wir nutzen sie nur.
- `MahnSektion`-Abhängigkeit aus `rechnungen.$id.tsx` wird durch eine neue 30-Zeilen-Komponente `ErinnerungsHinweis` ersetzt.
- Migrations werden NICHT angefasst, keine `DROP` oder `DELETE` auf Mahn-Tabellen.