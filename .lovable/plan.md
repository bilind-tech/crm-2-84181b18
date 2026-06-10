# Suchbare Kunden-Auswahl

Aktuell ist die Kunden-Auswahl in den Formularen ein einfaches Select mit langer, nicht filterbarer Liste. Ich baue daraus ein **suchbares Dropdown**, das beim Öffnen direkt im Suchfeld steht.

## Verhalten

- Klick auf das Dropdown öffnet die Liste **und** setzt den Cursor sofort in ein Suchfeld ganz oben.
- Tippen filtert die Kundenliste live (Treffer in Firmenname, Kürzel, Kundennummer; Groß/Kleinschreibung egal, Umlaute toleriert).
- Pfeiltasten ↑/↓ wählen, Enter übernimmt, Esc schließt.
- Klick auf einen Eintrag wählt den Kunden — exakt wie bisher.
- Leerer Zustand: „Keine Kunden gefunden".
- Ausgewählter Kunde wird im Trigger wie bisher angezeigt (Firmenname · Kürzel).
- Komplette Liste bleibt erhalten (kein künstliches Limit), nur eben filterbar.

## Wo wird es eingesetzt

Überall, wo heute das Kunden-Select steht:

1. **Neue Rechnung / Rechnung bearbeiten** — `RechnungForm.tsx`
2. **Neues Angebot / Angebot bearbeiten** — `AngebotForm.tsx`
3. **Protokolle (Übergabe & Schlüssel)** — `KundenObjektPicker.tsx` (wird von beiden Protokoll-Formularen genutzt)

Das Objekt-Dropdown im Protokoll-Picker bleibt unverändert (kurze Listen pro Kunde, keine Suche nötig).

## Technische Umsetzung

- Neue, wiederverwendbare Komponente `src/components/forms/KundePicker.tsx`, gebaut aus den vorhandenen shadcn-Bausteinen `Popover` + `Command` (gleiches Pattern wie `AnsprechpartnerPicker`).
- Props: `kunden`, `value`, `onChange`, optional `placeholder` / `disabled`.
- Beim Öffnen autofokussiert `CommandInput`.
- Kein neuer Datenfluss, keine Backend-Änderung, keine Änderungen am gespeicherten Datenmodell — nur UI-Austausch.

## Nicht im Umfang

- Keine Änderung an Objekt-/Ansprechpartner-/Vertrag-Dropdowns.
- Kein neues serverseitiges Suchen — Filter läuft clientseitig über die bereits geladene Kundenliste.
