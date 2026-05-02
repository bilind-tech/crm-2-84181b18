
# Step 14 — Frontend-Cleanup Mahnwesen

Backend-Mahn-Automatik aus Step 13 läuft, aber Frontend rechnet weiter alles
selbst (`bestimmeMahnZustand` clientseitig pro Rechnung) und sendet Mahnungen
über den alten Direkt-Email-Pfad statt über die neue Backend-Route. Step 14
zieht das gerade.

## Ziele

1. **Single Source of Truth = Backend.** Frontend zeigt Backend-Berechnung an, rechnet nur noch für reine UI-Hilfen (z.B. „in 3 Tagen empfohlen").
2. **Manueller Versand geht über `POST /rechnungen/:id/mahnung-versenden`** — Email-Worker übernimmt, Mahnungs-Eintrag wird transaktional gesetzt.
3. **Sichtbare Lauf-Historie** im Mahnwesen-Tab und Drill-Down.
4. **Dashboard-Aufgaben** ziehen Mahnvorschläge aus `/mahnung/status`.

## Umfang

### A — Frontend-Regeln zu Anzeige-Helfern degradieren

`src/lib/mahnung/regeln.ts`:
- `bestimmeMahnZustand` bleibt als Fallback / Live-Vorschau (Detailseite vor erstem Backend-Refresh), wird aber nicht mehr für Aktionsentscheidungen genutzt.
- Neue Helper: `formatEmpfehlung(zustand)`, `dringlichkeitsToken(zustand)` — pure Display-Mapping.
- JSDoc-Hinweis: „Kanonische Werte liefert `/mahnung/status`."

### B — Hooks erweitern

`src/hooks/useApi.ts`:
- `useMahnungVersenden(rechnungId)` → `POST /rechnungen/:id/mahnung-versenden { stufe }`. Invalidiert `qk.rechnung(id)`, `qk.rechnungen()`, `qk.email.versand()`, `["mahnung","status"]`, `["mahnung","laeufe"]`.
- `useMahnLauf(id)` für Drill-Down.
- QueryKeys: `qk.mahnung = { status, laeufe, lauf(id) }`.

### C — `MahnSektion` umbauen

- Versand-Pfad: statt `EmailVersandDialog` → kleiner Confirm-Dialog („Mahnung Stufe N senden? E-Mail wird vom Backend versendet."). Bei OK → `useMahnungVersenden`.
- `EmailVersandDialog` bleibt nur als Eskalations-Option („Mit eigener Vorlage senden …" Link → öffnet weiterhin den freien Editor + ruft alten Pfad).
- Status-/Empfehlungsanzeige liest primär aus neuem Hook `useRechnungMahnState(id)` (dünner Wrapper, der Backend-Berechnung über Rechnungs-Detail oder `/mahnung/status` mappt). Fallback: lokale `bestimmeMahnZustand`.

### D — `MahnwesenTab` erweitern: Lauf-Historie

Neue Karte „Letzte Läufe" (unter `AutomatikKarte`):
- Liste der letzten 10 Läufe aus `useMahnLaeufe()`: Datum, Auslöser (cron/manuell), geprüft / vorschlaege / versendet / fehler, kleines Badge bei Fehlern.
- Klick → Sheet/Dialog mit `useMahnLauf(id)` → Tabelle der Einträge (Rechnungs-Nr, Stufe, Aktion, Grund). Rechnungs-Nr = Link zu `/rechnungen/$id`.
- Empty-State: „Noch keine Läufe."

### E — `NaechsteSchritteCard` ans Backend anschließen

`src/lib/dashboard/naechsteSchritte.ts`:
- Funktion `berechneMahnSchritte` rausziehen.
- Neue Implementierung in `NaechsteSchritteCard`: ruft `useMahnStatus()`, mappt `letzterLauf.eintraege` mit `aktion === "vorschlag"` zu `NaechsterSchritt`-Items (Typ `mahnung_senden`).
- Übrige Schritt-Typen (Angebot nachfassen, Rechnung erstellen, Versenden) bleiben unverändert clientseitig.
- `mahnung_senden`-CTA navigiert weiter zu Rechnung (oder direkt versenden via Hook — bewusst Navigate, damit Stufe sichtbar bestätigt wird).

### F — Live-Events

`src/hooks/useLiveEvents.ts`:
- Neue Events `mahnung:lauf-fertig`, `mahnung:vorschlag` → invalidieren `qk.mahnung.status`, `qk.mahnung.laeufe`, betroffene `qk.rechnung()`.
- Dezenter Toast bei `lauf-fertig` mit `auto`-Modus: „N Mahnungen versendet".

### G — `useMahnZaehler` & andere Aufrufer

`src/hooks/useMahnZaehler.ts`: jetzt aus `useMahnStatus().letzterLauf.vorschlaege` lesen (Fallback: 0). Keine Client-Berechnung mehr.

Alle verbleibenden direkten `bestimmeMahnZustand`-Aufrufer (Listen-Routes `rechnungen.tsx`, `angebote.$id.tsx`) prüfen — wo möglich durch Backend-Daten/Status-Felder ersetzen, sonst als Fallback belassen mit JSDoc-Kommentar.

### H — Aufräumen

- `src/lib/dashboard/naechsteSchritte.ts`: Mahn-Logik entfernen, verbleibender Code dokumentiert „Backend-only für Mahnungen".
- Tote Imports raus.

## Was NICHT in Step 14

- Backend-Änderungen (Step 13 fertig).
- Inkasso-Workflow-Erweiterung.
- Eigene Mahn-Mail-Vorschau im UI vor Versand.

## Akzeptanzkriterien

1. Im `/einstellungen` → Mahnwesen-Tab erscheint unter „Automatik" eine Lauf-Historie. Klick öffnet Drill-Down mit Einträgen.
2. „Mahnung senden"-Button auf Rechnungs-Detailseite zeigt Mini-Confirm und erzeugt nach Klick: neuen `mahnungen[]`-Eintrag, Email-Versand-Eintrag, ohne dass der Email-Editor geöffnet werden muss.
3. „Mit eigener Vorlage senden …" weiterhin verfügbar (Power-User-Pfad).
4. Dashboard „Nächste Schritte" zeigt Mahnvorschläge identisch zum Backend-Lauf — kein Drift mehr zwischen Cockpit und Mahn-Cron.
5. SSE-Event `mahnung:lauf-fertig` triggert Refresh ohne manuelle Reload.
6. Keine Regression: `useMahnEinstellungen`, Pausieren, Inkasso, Stufen-Config funktionieren wie bisher.

## Geänderte / neue Dateien

**Editiert:**
- `src/hooks/useApi.ts` (neue Hooks + qk.mahnung)
- `src/hooks/useLiveEvents.ts` (neue Events)
- `src/hooks/useMahnZaehler.ts` (Backend-Quelle)
- `src/lib/mahnung/regeln.ts` (Display-Helper, JSDoc)
- `src/lib/dashboard/naechsteSchritte.ts` (Mahn-Pfad raus)
- `src/components/mahnung/MahnSektion.tsx` (Confirm-Dialog + Backend-Versand)
- `src/components/mahnung/MahnwesenTab.tsx` (Lauf-Historie-Karte + Drill-Down)
- `src/components/dashboard/NaechsteSchritteCard.tsx` (Mahn-Pfad via `useMahnStatus`)

**Neu:**
- `src/components/mahnung/MahnLaeufeListe.tsx`
- `src/components/mahnung/MahnLaufDetailDialog.tsx`
- `src/hooks/useRechnungMahnState.ts` (dünner Wrapper)

**Sag „los Step 14", dann setze ich um.**
