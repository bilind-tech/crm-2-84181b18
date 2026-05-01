# Kunden-Detailseite öffnet sich „unsichtbar" — Fix

## Was passiert technisch

Wenn du in der Kunden-Liste auf eine Zeile klickst, wechselt die URL korrekt zu `/kunden/{id}` — du siehst es ja oben in der Adresszeile. Aber:

1. Im Root-Layout (`src/routes/__root.tsx`) hängt am `<main>`-Element ein `key={pathname}`. Das **zerstört den gesamten Hauptbereich** bei jedem Routenwechsel und mountet ihn neu — inkl. Fade-In-Animation.
2. Auf der neuen Detail-Seite (`src/routes/kunden.$id.tsx`) lädt `useKunde(id)` die Daten frisch nach. Solange das läuft, wird **nur** ein winziger `LoadingPlaceholder` gerendert: drei dünne graue Skeleton-Striche und der Text „Lade …".
3. Wenn der Kunde im Mock-Backend nicht gefunden wird (z. B. nach einem Reload, weil neu angelegte Kunden nicht persistent sind, oder bei einem Query-Cache-Mismatch), wird sogar nur ein einziger Satz „Kunde nicht gefunden. Zurück" angezeigt.

Beides ist so unauffällig, dass es wirkt, als „passiert nichts". Genau das beschreibst du.

## Was ich ändern werde

### 1. Sichtbarer Lade-Skeleton auf der Detail-Seite
In `src/routes/kunden.$id.tsx` den nackten `LoadingPlaceholder` ersetzen durch ein vollständiges Skeleton-Layout, das die echte Detail-Seite vorzeichnet:
- Header-Karte mit Avatar-Platzhalter, Name-Skeleton, Status-Pill-Skeleton.
- Tab-Leiste-Skeleton.
- Zwei Spalten-Karten als Skeleton.

So sieht der User sofort, dass die richtige Seite geöffnet ist und gerade nur Daten nachgeladen werden.

### 2. Klarer „Nicht gefunden"-Zustand
Statt einer winzigen Textzeile eine ordentliche leere Seite:
- Großes Icon + Titel „Kunde nicht gefunden"
- Erklärung („Der Kunde wurde gelöscht oder die ID ist ungültig")
- Primär-Button „Zurück zur Kundenliste"

### 3. Root-Layout: kein Hard-Remount mehr
Den `key={pathname}` auf `<main>` in `src/routes/__root.tsx` entfernen. Er ist nur dafür da, die Fade-In-Animation neu zu triggern, sorgt aber dafür, dass jede Detail-Seite bei null beginnt — kein bestehender Skelett bleibt, kein progressives Rendering möglich. Die Animation kann auch ohne Remount geschehen (oder darf zugunsten flüssigerer Übergänge weg). Outlet rendert von TanStack Router ohnehin nur den geänderten Teilbaum.

### 4. Cache-Invalidierung nach „Neuer Kunde"
Sicherstellen, dass `useCreateKunde` nach erfolgreichem Anlegen die neue Kunden-ID in den Query-Cache (`qk.kunde(id)`) schreibt. Dann hat die Detail-Seite die Daten **sofort** beim Mount, ohne erst auf einen weiteren API-Roundtrip zu warten — null Lade-Lücke.

### 5. Konsistenz
Dieselben Verbesserungen (Skeleton-Layout + ordentlicher 404-Zustand) bekommen auch:
- `src/routes/angebote.$id.tsx`
- `src/routes/rechnungen.$id.tsx`
- `src/routes/objekte.$id.tsx`

Damit „verschwinden" auch dort keine Detail-Seiten mehr in einem unsichtbaren Lade-Zustand.

## Technische Details (für später)

- **Datei `src/routes/__root.tsx`**: `<main key={pathname} …>` → `<main …>`. `pathname` wird dann nur noch für den TopLoader benötigt.
- **Datei `src/routes/kunden.$id.tsx`**: Neue Komponente `KundeDetailSkeleton` (lokal in der Datei) und `KundeNotFound` mit `<Button asChild><Link to="/kunden">…</Link></Button>`.
- **Datei `src/hooks/useApi.ts`**: In `useCreateKunde.onSuccess` zusätzlich `qc.setQueryData(qk.kunde(neu.id), { ...neu, ansprechpartner: [], objekte: [], angebote: [], rechnungen: [], dokumente: [], notizen: [] })` setzen, damit die Detail-Route ohne Refetch sofort darstellbar ist.
- Skeleton-Aufbau via vorhandenem `<Skeleton>` aus `@/components/ui/skeleton`.

Nach Freigabe baue ich es in einem Rutsch.