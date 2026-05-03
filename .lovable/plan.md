## Analyse der globalen Suche

Ich habe die Suche von oben bis unten durchleuchtet (Frontend `GlobalSearch.tsx`, Hook `useSearch`, Backend-Endpoint `/suche`, FTS5-Index `suche_idx` und alle Trigger). Hier ist der ehrliche Status:

### Was heute funktioniert
- Volltextsuche über **Kunden** (Name, Nummer, Kürzel, E-Mail, Telefon, Adresse, Notizen)
- **Objekte** (Name, Nummer, Adresse, Zugangsinfo, Notizen)
- **Angebote** (Nummer, Titel, Intro/Outro, Notizen, Positionsbeschreibungen, Kundenname als Untertitel)
- **Rechnungen** (gleiche Felder wie Angebote)
- **Notizen** (Volltext, Link führt zur Eltern-Entität)
- Diakritik-tolerant ("gartner" findet "Gärtner") und Prefix-Matching ("müll" → "Müller GmbH")

### Was NICHT funktioniert (echte Lücken)
1. **Dokumente sind nicht durchsuchbar.** Es gibt keinen FTS-Trigger für die `dokument`-Tabelle. Dateiname, Tags, Notiz, Kundenbezug — nichts davon landet im Index. Das Frontend listet `dokument` zwar als Treffer-Typ, aber das Backend liefert nie welche.
2. **Protokolle (Übergabe/Abnahme & Schlüssel) sind nicht durchsuchbar.** Kein Trigger, kein Indexeintrag. Suche nach „Übergabe Müller" findet nichts.
3. **Stundenzettel** sind nicht durchsuchbar (z. B. nach Mitarbeiter oder Objekt).
4. **Belegnummer-Suche mit Sonderzeichen ist fragil.** `buildMatch` entfernt `/` und `-`, splittet `RE0526/01` in `re0526` + `01`. Tokens mit nur 1 Zeichen werden verworfen, also findet die Suche nach `01` allein nichts (Mindest-Tokenlänge 2). Suche nach reiner Belegnummer wie `RE0526-01` funktioniert nur, weil beide Teile ≥2 sind — `RE/01` würde scheitern.
5. **Kein Debounce im Frontend.** Jeder Tastendruck feuert einen Request — bei langsamer Verbindung spürbar.
6. **Routen-Mapping unvollständig.** `handleSelect` mappt nur `kunde/objekt/angebot/rechnung/dokument`. Für `dokument` würde aber `navigate({ to: "/dokumente", params: { id } })` aufgerufen — die Route nimmt aber gar keinen `id`-Param. Klicks auf Dokument-Treffer würden ins Leere gehen.
7. **Desktop-Dialog filtert client-seitig nach.** `CommandDialog` nutzt `cmdk` mit aktivem Filter; das `value`-Feld der Items ist `${typ}-${id}-${titel}` — passt der User-Input nicht zu diesem String, blendet cmdk den Treffer aus, obwohl das Backend ihn geliefert hat. Auf Mobil ist das schon mit `shouldFilter={false}` deaktiviert; Desktop fehlt das.

## Geplante Korrekturen

### Backend — neue Migration `010_fts_dokument_protokoll.sql`
- **Dokument-Trigger** (`dokument_ai/au/ad`): indexiert `dateiname`, `tags`, `notiz`, Kunden-/Objekt-Bezug. Untertitel: „Dokument · {Kunde oder Objektname}". Link → `/dokumente?focus={id}` (siehe unten).
- **Protokoll-Trigger** (`protokoll_ai/au/ad`): indexiert `nummer`, `art` (Übergabe/Abnahme/Schlüssel), Kundenname, Objektname, Notizen. Link → `/protokolle/$id`.
- **Stundenzettel-Trigger** (optional, leicht): indexiert Monat/Jahr + Notizen. Link → `/stundenzettel?monat=...`.

### Backend — `kunden/search.ts` robuster
- `buildMatch`: Mindest-Tokenlänge auf **1** senken, wenn der gesamte Query nur aus Ziffern/Kurzcodes besteht (damit `01` oder `K1` matchen).
- Belegnummern-Erkennung: wenn der Query auf `^[A-Z]{1,4}[-/0-9]+$` matcht, zusätzlich einen `nummer:`-spezifischen Fallback per `LIKE` über Kunde/Angebot/Rechnung/Protokoll/Dokument.
- Ergebnis-Reihenfolge: exakte Nummern-Treffer nach oben.

### Backend — `routes/stammdaten.ts`
- Endpoint-Antwort um `typ: "dokument" | "protokoll" | "stundenzettel"` ergänzen (TS-Union erweitern).

### Frontend — `GlobalSearch.tsx`
- 200 ms `useDebouncedValue` auf `q` vor `useSearch`.
- `shouldFilter={false}` **auch im Desktop-Dialog** (sonst frisst cmdk Backend-Treffer).
- `ICONS` + `GROUP_LABEL` um `protokoll` und `stundenzettel` erweitern (Icons: `ClipboardList`, `Clock`).
- `handleSelect`-Routenliste vervollständigen: 
  - `dokument` → `/dokumente` mit `search: { focus: id }` (kein Param, sondern Search-Param; damit die Liste hochscrollt/markiert).
  - `protokoll` → `/protokolle/$id`.
  - `stundenzettel` → `/stundenzettel` mit Monat-Search-Param.
- Hint-Zeile unten im Dialog: „Suche nach Name, Nummer, Adresse, Titel oder Inhalt".

### Frontend — `src/routes/dokumente.tsx`
- `validateSearch` mit `focus?: string` ergänzen, Liste scrollt zum Treffer und hebt ihn kurz hervor.

### Frontend — `src/lib/api/types.ts`
- `SuchTreffer.typ` um `"protokoll"` und `"stundenzettel"` erweitern.

### Reindex nach Migration
- Migration enthält ein einmaliges `INSERT INTO suche_idx ... SELECT ...` für alle bestehenden Dokumente, Protokolle und Stundenzettel, damit Altdaten sofort findbar sind.

## Ergebnis
Nach dieser Umsetzung findet die Suche **alles**: Kunden, Objekte, Angebote, Rechnungen, Notizen, **Dokumente**, **Protokolle (Übergabe/Abnahme + Schlüssel)** und **Stundenzettel** — jeweils per Name, Nummer (auch mit `/` und `-`), Adresse, Titel oder Inhalt. Klick führt zur passenden Detailseite oder zur Liste mit hervorgehobener Zeile.

Soll ich das so umsetzen?