# Übergabeprotokoll & Schlüsselübergabe: PDF-Erzeugung reparieren + Design wie Angebot/Rechnung

## Bug-Ursache (warum es ewig lädt)

In `src/lib/pdf/werkzeugePdf.ts`, Funktion `renderToBlob` (Zeile 387–393):

```ts
return await new Promise<Blob>((resolve) => {
  pdfDoc.getBlob((b: Blob) => resolve(b));   // Callback feuert in neueren pdfmake-Versionen NIE
});
```

Neuere `pdfmake`-Builds geben `getBlob()` als **Promise** zurück und ignorieren den Callback → unser Promise resolved nie → Spinner dreht sich endlos. `belegPdf.ts` (Angebot/Rechnung) handhabt beide Varianten korrekt — deshalb gehen die.

## 1. PDF-Renderer robust machen (Sofort-Fix)

`src/lib/pdf/werkzeugePdf.ts` `renderToBlob` 1:1 nach Vorbild aus `belegPdf.ts` Zeile 470–488 ersetzen — Callback **und** Promise-Rückgabe akzeptieren, leeren Blob abfangen, klare Fehlermeldung. Damit funktionieren beide Seiten ab sofort.

## 2. Design auf Angebot/Rechnung-Niveau heben

`werkzeugePdf.ts` (komplettes Layout-Refactor) übernimmt aus `belegPdf.ts`:

- Selbe **Seitenränder** (40 / 56 / 40 / 80) und Footer-Konstruktion (4-Spalten-Footer mit Firma · Bank · Steuer · Kontakt aus `Firmendaten`).
- Selber **Header** mit Logo rechts oben (aus `firma.logoUrl` mit Fallback auf `@/assets/logo.png`).
- Selbe **Typografie/Farben** (Schwarz auf Weiß, dünne graue 0.4-pt-Linien `#d4d4d4`, Section-Titles in Versalien wie auf Rechnung).
- **Belegnummer-Block** rechts oben analog Rechnung („Protokoll-Nr. PR-2026-0001", „Datum", „Kunde").

Daten kommen wie heute aus `useFirmendaten()` → automatisch aktuell, sobald in Einstellungen etwas geändert wird (kein zusätzlicher Code nötig, der Hook invalidiert).

## 3. Datenmodell sauber: Protokoll-Nummer (analog Belegnummern)

Neue Sequenzen im Mock-Backend (`src/lib/mock/backend.ts` neben den bestehenden Beleg-Zählern):

- `PR{MM}{YY}/{NN}` für Übergabe-/Abnahmeprotokolle
- `SU{MM}{YY}/{NN}` für Schlüsselübergaben

→ POST-Endpoints `/protokolle/next-nummer?art=uebergabe|schluessel` (Mock); Pi-Backend-TODO als Kommentar markiert. Frontend ruft die Nummer beim Erstellen ab und nutzt sie als Titel + Dateiname.

## 4. Auto-Speicherung in „Dokumente" (bereits da, wird beibehalten)

Der bestehende `useCreateDokument`-Aufruf in beiden Routen bleibt — Titel wird auf die neue Protokoll-Nummer umgestellt:

```
Übergabeprotokoll PR0526/01 – Mustermann GmbH – 03.05.2026
```

Datei landet automatisch in **Dokumente** (Typ `protokoll`) + verknüpft mit Kunde + Objekt. Im Detail-Dialog des Dokuments ist die PDF eingebettet abrufbar.

## 5. Live-Bezug zu Einstellungen

Heute schon korrekt: `useFirmendaten()` in beiden Routen liefert immer den aktuellen Stand (React-Query invalidiert beim Speichern in Einstellungen). Refactor stellt sicher, dass alle relevanten Felder verwendet werden:

- `firmenname`, `rechtsform`, `slogan`, `strasse/plz/ort`, `telefon`, `email`, `webseite`
- `geschaeftsfuehrer`, `handelsregister`, `ustId`, `steuernummer`
- `bankName`, `iban`, `bic` (im Footer)
- `logoUrl` (Header rechts)

Keine Doppelpflege — die Einstellungs-Seite ist die einzige Quelle.

## 6. UI-Feedback auf den beiden Routen

In `werkzeuge.uebergabeprotokoll.tsx` + `werkzeuge.schluesseluebergabe.tsx`:

- 30-Sekunden-Timeout um `buildBlob()` (`AbortController`-artig per `Promise.race`) — wenn etwas hängt, kommt nach 30s ein verständlicher Fehler statt endlosem Spinner.
- Bei Erfolg: `toast.success` mit Aktion „In Dokumenten öffnen" (Link zum frisch erstellten Dokument).

## Dateien

- **Edit:** `src/lib/pdf/werkzeugePdf.ts` — `renderToBlob` fix + Layout-Refactor (Header/Footer/Typografie analog `belegPdf.ts`).
- **Edit:** `src/lib/mock/backend.ts` — Sequenzen + Endpoint für Protokoll-Nummer.
- **Edit:** `src/hooks/useApi.ts` — kleiner Hook `useNextProtokollNummer(art)`.
- **Edit:** `src/routes/werkzeuge.uebergabeprotokoll.tsx` — Nummer abrufen, Timeout, Erfolgs-Toast mit Link.
- **Edit:** `src/routes/werkzeuge.schluesseluebergabe.tsx` — analog.
- **Memory-Update:** `mem://features/belegnummern` um Protokoll-Sequenzen ergänzen.

## Risiko

Klein. PDF-Renderer-Fix ist 1:1-Übernahme aus produktiv genutztem `belegPdf.ts`. Layout-Refactor ändert nichts am Datenmodell. Keine Schema-Migration nötig.
