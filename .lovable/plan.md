## Ziel
Mahnwesen komplett aus dem Frontend entfernen und durch ein freundliches „Zahlungserinnerung"-Feature ersetzen — ohne Stufen, ohne Gebühren, ohne Druck. Vorgeschlagen ab **14 Tagen nach Fälligkeit**, danach **alle 7 Tage** erneut, bis bezahlt.

## Was passiert (für dich)
1. Alles mit „Mahnung", „Mahnstufe", „Mahnwesen", „Mahn-Lauf" verschwindet aus der UI — auf dem Dashboard, in den Listen, in der Rechnungsdetail-Seite, in den Einstellungen und im E-Mail-Dialog.
2. Statt der roten Mahn-Warnung oben rechts taucht ein **dezenter Hinweis** auf, sobald eine Rechnung 14+ Tage offen ist. Klick → „Erinnerung senden" direkt aus dem Popup heraus.
3. In der **Rechnungsliste** und in der **Rechnungsdetailseite** erscheint dort, wo es relevant ist, ein **kleiner Primary-Button „Zahlungserinnerung senden"**.
4. Klick öffnet den bestehenden E-Mail-Dialog mit:
   - vorausgewählter Standard-Vorlage **„Zahlungserinnerung (freundlich)"**
   - korrektem Ansprechpartner aus dem Kunden
   - automatisch befüllten Platzhaltern: Rechnungsnummer, offener Betrag, Fälligkeitsdatum, Tage überfällig, Bankverbindung
   - Betreff: *„Erinnerung: Rechnung {nummer} vom {datum}"*
   - du schaust einmal drüber und klickst **Senden** — fertig.
5. Im **Dashboard-Block „Nächste Schritte"** erscheinen offene Erinnerungen anstelle der alten Mahn-Vorschläge.

## Logik des Vorschlags
Eine Rechnung schlägt eine Erinnerung vor, wenn:
- Status `versendet` / `teilbezahlt` / `überfällig` (also offener Betrag > 0)
- **≥ 14 Tage** seit Fälligkeit
- **noch nie** eine Erinnerung gesendet ODER **letzte Erinnerung ≥ 7 Tage** her

Erkennung „letzte Erinnerung" ohne Backend-Änderung: aus der bestehenden **E-Mail-Versand-Historie** der Rechnung wird der letzte Versand mit der Standard-Erinnerungsvorlage gelesen (Vorlagen-ID-Match).

## Entfernung im Detail
Gelöscht / aus UI entfernt:
- `src/components/mahnung/` (MahnwesenTab, MahnSektion, MahnLaeufeListe, MahnLaufDetailDialog)
- `src/hooks/useMahnZaehler.ts`
- `src/lib/mahnung/regeln.ts`, `src/lib/mahnung/defaults.ts`
- Mahn-Tab in `einstellungen.tsx` (Tab-ID, Eintrag, Render)
- Mahn-Block in `routes/index.tsx` (Mahn-Stats, useMahnZaehler)
- `<MahnSektion>` aus `rechnungen.$id.tsx`
- Mahn-Branch in `NaechsteSchritteCard.tsx` (typ `mahnung_senden`)
- Subtitle „… Mahnungen senden." in `rechnungen.tsx` → „… Zahlungen erfassen, Erinnerungen senden."
- `mahnStufe`-Prop, Mahn-Bestätigungsstufe und Mahn-Vorschauzeile aus `EmailVersandDialog.tsx`
- `mahnung`-Kontext aus `lib/email/placeholders.ts`
- Mahn-Hooks (`useMahnStatus`, `useMahnLauf`, `useMahnEinstellungen`) aus `useApi.ts` und Mahn-Events aus `useLiveEvents.ts`
- Mahn-bezogene Felder aus `lib/api/types.ts`, soweit nur frontend-genutzt (Typen, die das Backend liefert, bleiben tolerant ignoriert)

Backend bleibt **unangetastet**: Mahn-Routen/-Cron sind laut Memory ohnehin deaktiviert. Ohne UI sind sie unerreichbar.

## Neu
- `src/lib/erinnerung/regeln.ts` — reine Funktionen: `istErinnerungFaellig(rechnung, history)`, `naechsterErinnerungstag(...)`, Konstanten `ERINNERUNG_AB_TAGEN = 14`, `ERINNERUNG_INTERVALL = 7`.
- `src/hooks/useErinnerungen.ts` — liefert pro Rechnung Status (fällig/wartet/keine), aggregierter Zähler fürs Dashboard.
- `src/components/notifications/ErinnerungPopup.tsx` — ersetzt `UeberfaelligPopup` (neutraler Ton, Icon `MailClock`, kein `destructive`, je Zeile direkter „Erinnerung senden"-Button → öffnet `EmailVersandDialog` mit vorgewählter Vorlage).
- Inline-Button in `routes/rechnungen.tsx` (Liste, mobile + desktop) und `routes/rechnungen.$id.tsx` (oben bei den Aktions-Buttons, neben „Als bezahlt markieren").
- `NaechsteSchritteCard.tsx`: neuer Schritt-Typ `erinnerung_senden` (Icon `MailClock`, neutral, kein `warning`/`destructive`).
- Standard-E-Mail-Vorlage **„Zahlungserinnerung (freundlich)"** mit Kontext `rechnung` wird einmalig in den vorhandenen Vorlagen-Store geseedet, falls noch nicht vorhanden. Body kurz und höflich, keine Drohung, kein „Mahnung", keine Gebühr.

## Text der Vorlage (Default)
```
Betreff: Erinnerung: Rechnung {{rechnung.nummer}}

{{ansprechpartner.anrede}}

zu unserer Rechnung {{rechnung.nummer}} vom {{rechnung.datum}} über
{{rechnung.summe}} konnten wir bisher noch keinen Zahlungseingang feststellen.

Offen sind aktuell {{rechnung.offen}}.

Vielleicht ist die Rechnung untergegangen — wir möchten Sie freundlich
daran erinnern. Falls die Zahlung in den letzten Tagen erfolgt ist,
betrachten Sie diese Nachricht bitte als gegenstandslos.

Bankverbindung:
{{firma.bank}}
IBAN: {{firma.iban}}

Vielen Dank und viele Grüße
{{firma.firmenname}}
```

## Out of Scope
- Keine zweite/dritte Stufe, keine Gebühren, keine Fristverlängerung
- Kein automatischer Versand — strikt nur per Klick (Memory: „Niemals Auto-Mails")
- Backend-Schema/Cron unverändert

## Memory-Updates nach Implementierung
- Eintrag `features/mahnwesen` raus (falls vorhanden)
- Neuer Eintrag `features/zahlungserinnerung` mit Regel-Trigger 14/7 Tage