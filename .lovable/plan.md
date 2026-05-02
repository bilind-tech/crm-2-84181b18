## Ziel
Beim Anlegen eines Kunden werden die im Tab „Basis" erfassten Personendaten (Anrede, Vor-/Nachname, Telefon, Mobil, E-Mail) automatisch als **primärer Ansprechpartner** mitgespeichert. In der UI wird das transparent angezeigt.

## Änderungen

### 1. `src/components/forms/KundeForm.tsx`
- **Hinweis-Box** unter den Personen-/Kontaktfeldern im Tab „Basis" (vor der Tabs-Schließung):
  - Zeigt dynamisch, dass diese Daten als primärer Ansprechpartner gespeichert werden, sobald ein Name vorhanden ist.
  - Beispieltext: „Wird automatisch als primärer Ansprechpartner gespeichert: **Herr Max Mustermann** · max@…"
  - Bei Privat-Kunde: dezenter Hinweis „Diese Person ist gleichzeitig der Ansprechpartner."
  - Bei Firma ohne Person: „Tipp: Trage Anrede + Name ein, dann wird automatisch ein primärer Ansprechpartner für diese Firma angelegt."
- **In `submit()`** nach erfolgreichem `create.mutateAsync(...)` und vor dem optionalen Dauerauftrag:
  - Wenn `f.vorname || f.nachname || f.email || f.telefon || f.mobil` vorhanden:
    - `POST /ansprechpartner` aufrufen mit `{ kundeId: k.id, anrede, vorname, nachname, telefon, mobil, email, primaer: true }`.
  - Fehler still im Toast als Warnung, Kundenanlage bleibt erfolgreich.

### 2. `src/hooks/useApi.ts`
- Falls noch nicht vorhanden: kleinen `useCreateAnsprechpartner` Hook ergänzen (analog bestehender Mutationen) oder den existierenden nutzen. Cache-Invalidierung für `["ansprechpartner", kundeId]` und `["kunde", id]`.

### 3. Backend (Mock) — keine Änderung nötig
`POST /ansprechpartner` existiert bereits (`src/lib/mock/backend.ts:527`) und unterstützt `primaer`.

## Verhalten
- Firma „Muster GmbH" + Vorname „Max" + Nachname „Mustermann" → Kunde + 1 primärer Ansprechpartner Max Mustermann.
- Privat-Kunde → ebenso ein primärer Ansprechpartner mit denselben Personendaten (für konsistente Verwendung in Angeboten/Rechnungen, die `ansprechpartnerId` referenzieren).
- Leere Personenfelder → kein Ansprechpartner-Datensatz, nur Kunde.

## Out of Scope
- Mehrere Ansprechpartner direkt im Anlage-Formular (bleibt auf Kunden-Detailseite).
