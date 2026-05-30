## Bug

Beim Bearbeiten eines Kunden lässt sich die nächste Belegnummer (Startzähler des Monats) nicht nach **unten** korrigieren und der Wert `1` wird komplett ignoriert.

Ursachen im Backend:

1. **`backend/src/kunden/nummern.ts` → `bumpBelegNummerMindestens()`** verwendet
   ```sql
   DO UPDATE SET naechster_start = MAX(naechster_start, excluded.naechster_start)
   ```
   D. h. der Zähler kann nur erhöht, nie gesenkt werden. Trägt der User eine kleinere Zahl ein als der gespeicherte Wert, wird sie verworfen.

2. **`backend/src/routes/stammdaten.ts` Zeile 160**:
   ```ts
   if (result.kuerzel && Number.isFinite(startRaw) && startRaw > 1) { … }
   ```
   Mit `startRaw > 1` wird ein bewusst gewähltes `1` (Reset auf Monatsanfang) gar nicht ans Backend weitergegeben.

Effekt aus User-Sicht: PATCH läuft scheinbar durch (200 OK), DB-Wert bleibt aber unverändert → beim erneuten Öffnen erscheint die alte Zahl.

## Fix

### `backend/src/kunden/nummern.ts`
Neue, eindeutige Setter-Funktion ergänzen, die den Wert **exakt** schreibt:

```ts
export function setBelegNummerStart(
  kundeId: string,
  belegart: BelegArt,
  periodeMMYY: string,
  naechsterStart: number,
): void {
  const v = Math.max(1, Math.floor(naechsterStart));
  getDatabase()
    .prepare(
      `INSERT INTO belegnummer_zaehler (kunde_id, belegart, periode, naechster_start)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(kunde_id, belegart, periode)
         DO UPDATE SET naechster_start = excluded.naechster_start`,
    )
    .run(kundeId, belegart, periodeMMYY, v);
}
```

`bumpBelegNummerMindestens` bleibt für Import/Migration unverändert.

### `backend/src/routes/stammdaten.ts`
- Import `setBelegNummerStart` zusätzlich.
- PATCH-Route (Zeile 160): Guard von `startRaw > 1` auf `startRaw >= 1` ändern und `setBelegNummerStart` statt `bumpBelegNummerMindestens` aufrufen — für `rechnung` UND `angebot`.
- POST-Route (Zeile 120): analog auf `setBelegNummerStart` umstellen, damit der Startwert auch beim Anlegen exakt übernommen wird (statt nur „bumpen").

### Tests
- `backend/test/belege.spec.ts` (oder neue `kunden-zaehler.spec.ts`): zwei Cases
  1. Start auf 7 setzen → GET `/kunden/:id/zaehler` liefert 7. Danach auf 3 senken → GET liefert 3.
  2. Start auf 1 setzen wird persistiert.

## Scope

Nur Backend:
- `backend/src/kunden/nummern.ts`
- `backend/src/routes/stammdaten.ts`
- ein Test

Frontend (`KundeBearbeitenDialog.tsx`, `useKundenZaehler`-Invalidation) ist bereits korrekt und bleibt unverändert.
