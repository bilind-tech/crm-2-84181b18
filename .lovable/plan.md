## Ziel

Auf der Rechnungs-Übersicht (`/rechnungen`) ein neuer Button neben „Neue Rechnung". Klick öffnet einen Dialog mit allen Daueraufträgen. Du wählst beliebig viele aus (oder alle), klickst „Erzeugen", und für jede Auswahl wird sofort eine Rechnung erstellt. Anschließend bleibst du auf der Rechnungsliste — die neuen Entwürfe stehen oben.

## UI-Fluss

1. Button „Aus Dauerauftrag erzeugen" (Icon: ⟲ Repeat) neben dem bestehenden „Neue Rechnung"-Button im PageHeader.
2. Klick → Dialog `RechnungAusDauerauftragDialog` (mittig, schlicht, kein Gradient).
3. Dialog-Inhalt:
   - Header: „Rechnungen aus Daueraufträgen erzeugen"
   - Master-Checkbox „Alle auswählen / Auswahl aufheben"
   - Scrollbare Liste aller Daueraufträge (auch beendete, ausgegraut). Jede Zeile:
     - Checkbox · Bezeichnung · Kundenname · Rhythmus · Brutto/Lauf · Status-Badge (aktiv/pausiert/beendet)
     - Kleiner Hinweis-Text in Warnfarbe wenn für aktuelle Periode (z. B. „05/2026") schon ein Lauf existiert: „⚠ bereits erzeugt für 05/2026"
   - Footer: „N ausgewählt" · Buttons „Abbrechen" und primärer „Erzeugen (N)"
4. Klick „Erzeugen":
   - Für jeden ausgewählten Dauerauftrag wird `useSofortLauf(id).mutateAsync()` parallel aufgerufen.
   - Während des Erzeugens: Button disabled, kleiner Spinner.
   - Toast nach Abschluss: „N Rechnung(en) erzeugt" (bzw. Fehler-Toast wenn welche fehlschlagen — Erfolge werden trotzdem erzeugt).
   - Dialog schließt, Query-Cache `["rechnungen"]` wird invalidiert (passiert schon im Hook).
5. Du bleibst auf `/rechnungen` — die neuen Entwürfe erscheinen oben in der Liste (Sortierung nach Datum).

## Edge Cases

- Keine Daueraufträge vorhanden: Dialog zeigt schlichten Empty-State „Noch keine Daueraufträge — leg einen an, indem du beim Anlegen einer Rechnung das Häkchen ‚Wiederkehrend' setzt."
- Beendete Daueraufträge: in Liste sichtbar, aber Checkbox disabled + Zeile leicht ausgegraut. Master-Checkbox wählt nur die auswählbaren.
- Doppelt erzeugen: Hinweis-Text in Warnfarbe wird angezeigt, Auswahl bleibt aber möglich. Backend-Sofort-Lauf erzeugt ohnehin idempotent pro Periode (siehe `backend.ts` Zeile 1808 ff. — existiert Lauf für `(dauerauftragId, periode)` bereits, wird der bestehende zurückgegeben). Damit kein Schaden, nur Hinweis zur Klarheit.

## Datei-Operationen

**Neu:**
- `src/components/dauerauftrag/RechnungAusDauerauftragDialog.tsx` — der Mehrfachauswahl-Dialog mit eigener Logik (Auswahl-State, parallele Sofort-Läufe, Empty-State, „bereits erzeugt"-Erkennung).

**Anpassen:**
- `src/routes/rechnungen.tsx` — neuen Button im `PageHeader actions` einfügen, Dialog-State + Render hinzufügen.

## Technische Details

- „Aktuelle Periode" = `YYYY-MM` aus heutigem Datum (gleiche Logik wie Backend-Generator). Pro Dauerauftrag prüfen, ob in `useDauerauftragLaeufe()` ein Lauf mit `dauerauftragId === da.id && periode === aktuellePeriode` existiert.
- Auswahl als `Set<string>` von Dauerauftrags-IDs.
- Erzeugen via `Promise.allSettled` über alle ausgewählten IDs (jeder Aufruf nutzt einen frisch instanziierten `useSofortLauf(id)` — da Hooks aber pro Render gebunden sind, lösen wir das alternativ über eine kleine Helper-Funktion, die direkt `api.post(\`/dauerauftraege/${id}/sofort-lauf\`)` aufruft und am Ende einmal die relevanten Queries invalidiert. Saubere Variante: eine neue `useSofortLaufBulk()`-Mutation, die ein Array von IDs nimmt.
- `useSofortLaufBulk()` wird in `src/hooks/useDauerauftraege.ts` ergänzt: erwartet `string[]`, ruft `Promise.allSettled` auf, liefert `{ erfolge: number; fehler: number; rechnungIds: string[] }`, invalidiert am Ende `rechnungen`, `dauerauftrag-laeufe`, `dauerauftraege`, `aktivitaeten`.
- Layout des Dialogs: `Dialog` aus `@/components/ui/dialog`, max-width `sm:max-w-lg`, Liste mit `max-h-[60vh] overflow-y-auto`. Hintergrund schlicht `bg-background` (Memory-Regel).

## Ergebnis

Ein Klick → Mehrfachauswahl → ein weiterer Klick → fertig. Keine Umwege über Detail-Seiten, kein einzelnes Antippen pro Dauerauftrag.